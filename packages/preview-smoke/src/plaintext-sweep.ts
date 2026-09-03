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
  rowsObserved: number;
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

/** Preview Neon scales to zero between releases, so a resume is the normal case, not the exception. */
const CONNECT_TIMEOUT_SECONDS = 20;

/** Server-side backstop, so one stuck scan reports a precise Postgres error well before the deadline. */
const STATEMENT_TIMEOUT_MS = 25_000;

/**
 * Bounds the whole call, connect included. The Playwright tests that call this allow 180s and
 * `webhook-subscriptions.spec.ts` sweeps twice inside one of them, so a per-statement ceiling does
 * not bound the run: 47 statements under it can outlive the test and report nothing but a Playwright
 * timeout, which is the failure INS-642 is about.
 */
const SWEEP_DEADLINE_MS = 50_000;

/** Aggregate row counter, aliased alongside the per-probe `h{n}` columns. */
const ROW_COUNT_ALIAS = "sweep_row_count";

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
  const sweep = sweepUnderServiceAccess(sql, sentinel);
  // The deadline can win the race below; keep the loser's rejection from surfacing unhandled.
  sweep.catch(() => undefined);
  let expiry: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sweep,
      new Promise<never>((_resolve, reject) => {
        expiry = setTimeout(() => {
          reject(
            new Error(`Plaintext sweep: exceeded its ${String(SWEEP_DEADLINE_MS)}ms deadline`),
          );
        }, SWEEP_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(expiry);
    await sql.end({ timeout: 5 });
  }
}

async function sweepUnderServiceAccess(
  sql: ReturnType<typeof postgres>,
  sentinel: Sentinel,
): Promise<PlaintextSweepResult> {
  return sql.begin(async (tx) => {
    // Transaction-local Service Access scope, the ADR-0037 engine gate, matching
    // `packages/tenant-store/src/apply-tenant-scope.ts`. Session scope would survive as a silent
    // false pass if the pooled connection dropped and postgres.js reconnected without it: RLS would
    // then hide every row and the sweep would report a clean database it never read.
    await tx`SELECT set_config('app.service', 'true', true)`;
    await assertServiceAccessScope(tx);
    const columns = await listTextualColumns(tx);
    const sweep = await sweepPostgresColumns(tx, columns, sentinel);
    // A row count cannot prove the scope took effect, because the instance-level tables the preview
    // seed writes carry no RLS policy at all and would report rows either way. It catches the other
    // way the gate can prove nothing: a database with no data in it.
    if (sweep.rowsObserved === 0) {
      throw new Error(
        `Plaintext sweep: scanned ${String(columns.length)} textual column(s) across ${String(countTables(columns))} table(s) but observed zero rows, so the sweep proved nothing`,
      );
    }
    return { columnCount: columns.length, ...sweep };
  });
}

/**
 * Reads the scope back on the connection the sweep will actually use. Without Service Access every
 * tenant table is invisible, `bool_or` aggregates to NULL, and the sweep reports a clean database it
 * never read — the one failure this gate must never produce.
 */
async function assertServiceAccessScope(sql: postgres.TransactionSql): Promise<void> {
  const [row] = await sql<{ scope: string | null }[]>`
    SELECT current_setting('app.service', true) AS scope
  `;
  if (row?.scope !== "true") {
    throw new Error(
      `Plaintext sweep: Service Access scope is ${row?.scope ?? "unset"}, so RLS would hide the rows this gate must read`,
    );
  }
}

/**
 * One aggregate scan per table covers every textual column against every sentinel encoding. Probing
 * each column/encoding pair separately meant roughly 1200 sequential round trips against preview
 * Neon, which outlived the Playwright per-test budget whenever the backup export was running
 * against the same compute (INS-642).
 */
async function sweepPostgresColumns(
  sql: postgres.TransactionSql,
  columns: TextColumn[],
  sentinel: Sentinel,
): Promise<{ hits: SweepHit[]; rowsObserved: number }> {
  const hits: SweepHit[] = [];
  let rowsObserved = 0;
  for (const [tableName, tableColumns] of groupColumnsByTable(columns)) {
    const query = buildTableSweepQuery(tableName, tableColumns, sentinel.variants);
    const [row] = await sql.unsafe(query.text, query.parameters);
    if (row === undefined) {
      throw new Error(`Plaintext sweep: aggregate probe for ${tableName} returned no row`);
    }
    rowsObserved += readRowCount(tableName, row);
    hits.push(...collectTableHits(tableName, query.probes, row));
  }
  return { hits, rowsObserved };
}

/** Attributes a single aggregate row back to the column and encoding each probe stands for. */
export function collectTableHits(
  tableName: string,
  probes: readonly SweepProbe[],
  row: Record<string, unknown>,
): SweepHit[] {
  const hits: SweepHit[] = [];
  for (const probe of probes) {
    const value = row[probe.alias];
    if (typeof value !== "boolean") {
      throw new Error(
        `Plaintext sweep: probe ${probe.alias} on ${tableName}.${probe.columnName} returned ${typeof value}, not a boolean`,
      );
    }
    if (value) {
      hits.push({ columnName: probe.columnName, encoding: probe.encoding, tableName });
    }
  }
  return hits;
}

function readRowCount(tableName: string, row: Record<string, unknown>): number {
  const value = row[ROW_COUNT_ALIAS];
  const count = typeof value === "string" ? Number(value) : value;
  if (typeof count !== "number" || !Number.isInteger(count)) {
    throw new Error(`Plaintext sweep: aggregate probe for ${tableName} returned no row count`);
  }
  return count;
}

function countTables(columns: readonly TextColumn[]): number {
  return groupColumnsByTable(columns).size;
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
 * for the no-hit case the gate asserts, and it keeps per-column, per-encoding attribution. `bool_or`
 * yields NULL for a table it read no rows from, which is indistinguishable from a clean table, so
 * the query also returns the row count the caller uses to prove it actually read something.
 */
export function buildTableSweepQuery(
  tableName: string,
  columns: readonly { columnName: string }[],
  variants: readonly { encoding: string; pattern: string }[],
): TableSweepQuery {
  const parameters: string[] = [];
  const probes: SweepProbe[] = [];
  const selections: string[] = [`COUNT(*) AS ${ROW_COUNT_ALIAS}`];
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

async function listTextualColumns(sql: postgres.TransactionSql): Promise<TextColumn[]> {
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
