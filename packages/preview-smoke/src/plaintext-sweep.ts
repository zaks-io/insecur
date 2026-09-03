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

interface SweepProbe {
  alias: string;
  columnName: string;
  encoding: string;
}

export interface TableSweepQuery {
  parameters: string[];
  probes: SweepProbe[];
  text: string;
}

const TEXTUAL_COLUMN_TYPES = new Set(["character", "character varying", "json", "jsonb", "text"]);

const CONNECT_TIMEOUT_SECONDS = 15;

/**
 * A per-table scan of the preview schema is fast; anything past this is a stalled compute, and the
 * sweep must say so rather than consume the whole Playwright budget in silence.
 */
const STATEMENT_TIMEOUT_MS = 60_000;

export async function runPlaintextSweep(
  databaseUrl: string,
  sentinel: Sentinel,
): Promise<PlaintextSweepResult> {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    connection: { statement_timeout: STATEMENT_TIMEOUT_MS },
  });
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

/**
 * One aggregate scan per table covers every textual column against every sentinel encoding. Probing
 * each column/encoding pair separately meant roughly 1200 sequential round trips against preview
 * Neon, which outlived the Playwright per-test budget whenever the backup export was running
 * against the same compute (INS-642).
 */
async function sweepPostgresColumns(
  sql: ReturnType<typeof postgres>,
  columns: TextColumn[],
  sentinel: Sentinel,
): Promise<SweepHit[]> {
  const hits: SweepHit[] = [];
  for (const [tableName, tableColumns] of groupColumnsByTable(columns)) {
    const query = buildTableSweepQuery(tableName, tableColumns, sentinel.variants);
    const [row] = await sql.unsafe(query.text, query.parameters);
    if (row === undefined) {
      throw new Error(`Plaintext sweep: aggregate probe for ${tableName} returned no row`);
    }
    for (const probe of query.probes) {
      if (row[probe.alias] === true) {
        hits.push({ columnName: probe.columnName, encoding: probe.encoding, tableName });
      }
    }
  }
  return hits;
}

function groupColumnsByTable(columns: readonly TextColumn[]): Map<string, TextColumn[]> {
  const byTable = new Map<string, TextColumn[]>();
  for (const column of columns) {
    const existing = byTable.get(column.tableName);
    if (existing === undefined) {
      byTable.set(column.tableName, [column]);
    } else {
      existing.push(column);
    }
  }
  return byTable;
}

/**
 * `bool_or` over the whole table is equivalent to the previous per-column `LIMIT 1` existence probe
 * for the no-hit case the gate asserts, and it keeps per-column, per-encoding attribution. An empty
 * table aggregates to NULL, so every probe is coalesced to false.
 */
export function buildTableSweepQuery(
  tableName: string,
  columns: readonly { columnName: string }[],
  variants: readonly { encoding: string; pattern: string }[],
): TableSweepQuery {
  const parameters: string[] = [];
  const probes: SweepProbe[] = [];
  const selections: string[] = [];
  for (const column of columns) {
    for (const variant of variants) {
      const alias = `h${String(probes.length)}`;
      parameters.push(`%${escapeLikePattern(variant.pattern)}%`);
      selections.push(
        `COALESCE(bool_or(${quoteIdentifier(column.columnName)}::text LIKE $${String(parameters.length)} ESCAPE '\\'), false) AS ${alias}`,
      );
      probes.push({ alias, columnName: column.columnName, encoding: variant.encoding });
    }
  }
  return {
    parameters,
    probes,
    text: `SELECT ${selections.join(", ")} FROM ${quoteIdentifier(tableName)}`,
  };
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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/gu, '""')}"`;
}

function escapeLikePattern(pattern: string): string {
  return pattern.replace(/\\/gu, "\\\\").replace(/%/gu, "\\%").replace(/_/gu, "\\_");
}
