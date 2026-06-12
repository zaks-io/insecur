import postgres from "postgres";
import {
  escapeLikePattern,
  type CanarySentinel,
  type SentinelEncoding,
  type SentinelVariant,
} from "./sentinel-encodings.js";

export interface SchemaColumn {
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

export async function simulateEncryptionBypassLeak(
  migrationUrl: string,
  sentinel: CanarySentinel,
  target: {
    tableName: string;
    columnName: string;
    orgId: string;
    secretId: string;
    versionId: string;
    restoreValue: string;
  },
): Promise<{ hits: SweepHit[]; rawHit: SweepHit | undefined }> {
  const sql = createMigrationSweepSql(migrationUrl);
  const rawVariant = variantForEncoding(sentinel, "raw");

  try {
    await enableServiceAccessScope(sql);
    const updated = await sql.unsafe(
      `UPDATE ${quoteIdentifier(target.tableName)} SET ${quoteIdentifier(target.columnName)} = $1 WHERE id = $2 AND org_id = $3 AND secret_id = $4`,
      [rawVariant.pattern, target.versionId, target.orgId, target.secretId],
    );
    if (updated.count !== 1) {
      throw new Error(
        `negative-control UPDATE affected ${updated.count} rows in ${target.tableName}; expected 1`,
      );
    }

    const columns = await listPublicSchemaColumns(sql);
    const postgresHits = await sweepPostgresColumns(sql, columns, sentinel);
    const hits = postgresHits;
    return { hits, rawHit: findEncodingHit(hits, "raw") };
  } finally {
    await enableServiceAccessScope(sql);
    await sql.unsafe(
      `UPDATE ${quoteIdentifier(target.tableName)} SET ${quoteIdentifier(target.columnName)} = $1 WHERE id = $2 AND org_id = $3 AND secret_id = $4`,
      [target.restoreValue, target.versionId, target.orgId, target.secretId],
    );
    await sql.end({ timeout: 5 });
  }
}
