import postgres from "postgres";

import type { Sentinel } from "./redaction";

interface TextColumn {
  columnName: string;
  dataType: string;
  tableName: string;
  udtName: string;
}

interface SweepHit {
  columnName: string;
  encoding: string;
  tableName: string;
}

export interface PlaintextSweepResult {
  columnCount: number;
  hits: SweepHit[];
}

const TEXTUAL_COLUMN_TYPES = new Set(["character", "character varying", "json", "jsonb", "text"]);

export async function runPlaintextSweep(
  databaseUrl: string,
  sentinel: Sentinel,
): Promise<PlaintextSweepResult> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`SELECT set_config('app.service', ${"true"}, ${false})`;
    const columns = await listTextualColumns(sql);
    return {
      columnCount: columns.length,
      hits: await sweepPostgresColumns(sql, columns, sentinel),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function sweepPostgresColumns(
  sql: ReturnType<typeof postgres>,
  columns: TextColumn[],
  sentinel: Sentinel,
): Promise<SweepHit[]> {
  const hits: SweepHit[] = [];
  for (const column of columns) {
    for (const variant of sentinel.variants) {
      if (await columnContainsPattern(sql, column.tableName, column.columnName, variant.pattern)) {
        hits.push({
          columnName: column.columnName,
          encoding: variant.encoding,
          tableName: column.tableName,
        });
      }
    }
  }
  return hits;
}

async function listTextualColumns(sql: ReturnType<typeof postgres>): Promise<TextColumn[]> {
  const rows = await sql<TextColumn[]>`
    SELECT table_name AS "tableName",
           column_name AS "columnName",
           data_type AS "dataType",
           udt_name AS "udtName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        data_type IN ('text', 'character varying', 'character', 'json', 'jsonb')
        OR udt_name IN ('text', 'varchar', 'bpchar', 'json', 'jsonb')
      )
    ORDER BY table_name, ordinal_position
  `;
  return rows.filter(
    (column) =>
      TEXTUAL_COLUMN_TYPES.has(column.dataType) || TEXTUAL_COLUMN_TYPES.has(column.udtName),
  );
}

async function columnContainsPattern(
  sql: ReturnType<typeof postgres>,
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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function escapeLikePattern(pattern: string): string {
  return pattern.replace(/\\/gu, "\\\\").replace(/%/gu, "\\%").replace(/_/gu, "\\_");
}
