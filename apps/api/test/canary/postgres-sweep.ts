import { secretVersionId } from "@insecur/domain";
import postgres from "postgres";
import {
  escapeLikePattern,
  type CanarySentinel,
  type SentinelEncoding,
  type SentinelVariant,
} from "./sentinel-encodings.js";

interface SchemaColumn {
  tableName: string;
  columnName: string;
}

export interface SweepHit {
  surface: "postgres" | "console";
  tableName?: string;
  columnName?: string;
  encoding: SentinelEncoding;
  redactedPrefix: string;
}

export async function listPublicSchemaColumns(sql: postgres.Sql): Promise<SchemaColumn[]> {
  const rows = await sql<{ tableName: string; columnName: string }[]>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;
  return rows;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function createMigrationSweepSql(migrationUrl: string): postgres.Sql {
  return postgres(migrationUrl, { prepare: false, max: 1 });
}

/** Cross-tenant reads for the canary sweep (migration role is NOBYPASSRLS). */
async function enableServiceAccessScope(sql: postgres.Sql): Promise<void> {
  await sql`SELECT set_config('app.service', ${"true"}, ${false})`;
}

async function columnContainsPattern(
  sql: postgres.Sql,
  tableName: string,
  columnName: string,
  pattern: string,
): Promise<boolean> {
  const table = quoteIdentifier(tableName);
  const column = quoteIdentifier(columnName);
  const escaped = escapeLikePattern(pattern);
  const query = `SELECT 1 AS hit FROM ${table} WHERE ${column}::text LIKE $1 ESCAPE '\\' LIMIT 1`;
  const rows = await sql.unsafe(query, [`%${escaped}%`]);
  return rows.length > 0;
}

export async function sweepPostgresColumns(
  sql: postgres.Sql,
  columns: SchemaColumn[],
  sentinel: CanarySentinel,
): Promise<SweepHit[]> {
  const hits: SweepHit[] = [];

  for (const { tableName, columnName } of columns) {
    for (const variant of sentinel.variants) {
      const found = await columnContainsPattern(sql, tableName, columnName, variant.pattern);
      if (found) {
        hits.push({
          surface: "postgres",
          tableName,
          columnName,
          encoding: variant.encoding,
          redactedPrefix: sentinel.redactedPrefix,
        });
      }
    }
  }

  return hits;
}

export function sweepTextOutput(text: string, sentinel: CanarySentinel): SweepHit[] {
  const hits: SweepHit[] = [];

  for (const variant of sentinel.variants) {
    if (text.includes(variant.pattern)) {
      hits.push({
        surface: "console",
        encoding: variant.encoding,
        redactedPrefix: sentinel.redactedPrefix,
      });
    }
  }

  return hits;
}

export function formatSweepHits(hits: SweepHit[]): string {
  return hits
    .map((hit) => {
      if (hit.surface === "postgres") {
        return `postgres ${hit.tableName}.${hit.columnName} (${hit.encoding}, sentinel ${hit.redactedPrefix})`;
      }
      return `console (${hit.encoding}, sentinel ${hit.redactedPrefix})`;
    })
    .join("\n");
}

export async function sweepAllSurfaces(
  migrationUrl: string,
  sentinel: CanarySentinel,
  consoleOutput: string,
): Promise<SweepHit[]> {
  const sql = createMigrationSweepSql(migrationUrl);
  try {
    await enableServiceAccessScope(sql);
    const columns = await listPublicSchemaColumns(sql);
    const postgresHits = await sweepPostgresColumns(sql, columns, sentinel);
    const consoleHits = sweepTextOutput(consoleOutput, sentinel);
    return [...postgresHits, ...consoleHits];
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function findEncodingHit(
  hits: SweepHit[],
  encoding: SentinelEncoding,
): SweepHit | undefined {
  return hits.find((hit) => hit.encoding === encoding);
}

function variantForEncoding(sentinel: CanarySentinel, encoding: SentinelEncoding): SentinelVariant {
  const variant = sentinel.variants.find((entry) => entry.encoding === encoding);
  if (!variant) {
    throw new Error(`Missing sentinel variant for encoding ${encoding}`);
  }
  return variant;
}

/** Isolated version number for negative-control rows (outside seeded baseline versions). */
const NEGATIVE_CONTROL_VERSION_NUMBER = 999_999;

interface NegativeControlTarget {
  tableName: string;
  columnName: string;
  orgId: string;
  secretId: string;
}

function assertSingleRowMutation(
  count: number,
  operation: "INSERT" | "UPDATE" | "DELETE",
  tableName: string,
): void {
  if (count !== 1) {
    throw new Error(
      `negative-control ${operation} affected ${count} rows in ${tableName}; expected 1`,
    );
  }
}

async function insertNegativeControlRow(
  sql: postgres.Sql,
  target: NegativeControlTarget,
  versionId: string,
): Promise<void> {
  const inserted = await sql.unsafe(
    `INSERT INTO ${quoteIdentifier(target.tableName)} (id, org_id, secret_id, version_number, organization_data_key_version, project_data_key_version, ciphertext_storage_ref) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      versionId,
      target.orgId,
      target.secretId,
      NEGATIVE_CONTROL_VERSION_NUMBER,
      1,
      1,
      "canary-negative-control-placeholder",
    ],
  );
  assertSingleRowMutation(inserted.count, "INSERT", target.tableName);
}

async function plantNegativeControlSentinel(
  sql: postgres.Sql,
  target: NegativeControlTarget,
  versionId: string,
  sentinelPattern: string,
): Promise<void> {
  const updated = await sql.unsafe(
    `UPDATE ${quoteIdentifier(target.tableName)} SET ${quoteIdentifier(target.columnName)} = $1 WHERE id = $2 AND org_id = $3 AND secret_id = $4`,
    [sentinelPattern, versionId, target.orgId, target.secretId],
  );
  assertSingleRowMutation(updated.count, "UPDATE", target.tableName);
}

async function deleteNegativeControlRow(
  sql: postgres.Sql,
  target: NegativeControlTarget,
  versionId: string,
): Promise<void> {
  const deleted = await sql.unsafe(
    `DELETE FROM ${quoteIdentifier(target.tableName)} WHERE id = $1 AND org_id = $2 AND secret_id = $3`,
    [versionId, target.orgId, target.secretId],
  );
  assertSingleRowMutation(deleted.count, "DELETE", target.tableName);
}

async function runNegativeControlSweep(
  sql: postgres.Sql,
  sentinel: CanarySentinel,
  target: NegativeControlTarget,
  versionId: string,
): Promise<{ hits: SweepHit[]; rawHit: SweepHit | undefined }> {
  await enableServiceAccessScope(sql);
  await insertNegativeControlRow(sql, target, versionId);
  const rawVariant = variantForEncoding(sentinel, "raw");
  await plantNegativeControlSentinel(sql, target, versionId, rawVariant.pattern);
  const columns = await listPublicSchemaColumns(sql);
  const postgresHits = await sweepPostgresColumns(sql, columns, sentinel);
  return { hits: postgresHits, rawHit: findEncodingHit(postgresHits, "raw") };
}

function finalizeNegativeControlResult(
  mainError: unknown,
  cleanupError: Error | undefined,
  result: { hits: SweepHit[]; rawHit: SweepHit | undefined } | undefined,
): { hits: SweepHit[]; rawHit: SweepHit | undefined } {
  if (mainError) {
    throw mainError;
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (!result) {
    throw new Error("negative-control sweep did not produce a result");
  }
  return result;
}

async function cleanupNegativeControlRow(
  sql: postgres.Sql,
  target: NegativeControlTarget,
  versionId: string,
): Promise<void> {
  await enableServiceAccessScope(sql);
  await deleteNegativeControlRow(sql, target, versionId);
}

export async function simulateEncryptionBypassLeak(
  migrationUrl: string,
  sentinel: CanarySentinel,
  target: NegativeControlTarget,
): Promise<{ hits: SweepHit[]; rawHit: SweepHit | undefined }> {
  const sql = createMigrationSweepSql(migrationUrl);
  const dedicatedVersionId = secretVersionId.generate();
  let mainError: unknown;
  let cleanupError: Error | undefined;
  let result: { hits: SweepHit[]; rawHit: SweepHit | undefined } | undefined;

  try {
    result = await runNegativeControlSweep(sql, sentinel, target, dedicatedVersionId);
  } catch (error) {
    mainError = error;
  } finally {
    try {
      await cleanupNegativeControlRow(sql, target, dedicatedVersionId);
    } catch (error) {
      cleanupError = error instanceof Error ? error : new Error(String(error));
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  return finalizeNegativeControlResult(mainError, cleanupError, result);
}
