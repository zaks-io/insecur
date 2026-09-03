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

export interface SweepObservation {
  protectedByRls: boolean;
  rowCount: number;
  tableName: string;
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
const CONNECT_TIMEOUT_SECONDS = 30;

/** Server-side backstop, so one stuck scan reports a precise Postgres error well before the deadline. */
const STATEMENT_TIMEOUT_MS = 30_000;

/**
 * Bounds the scan work and the connect that precedes it; teardown adds up to `END_TIMEOUT_SECONDS`
 * on top. The Playwright tests that call this allow 180s and `webhook-subscriptions.spec.ts` sweeps
 * twice inside one of them, so a per-statement ceiling does not bound the run: a few dozen statements
 * under it can outlive the test and report nothing but a Playwright timeout, which is the failure
 * INS-642 is about. Two sweeps at the ceiling leave the rest of that test roughly 30s.
 */
const SWEEP_DEADLINE_MS = 70_000;

const END_TIMEOUT_SECONDS = 5;

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
  // Named so the deadline can say which table it stalled on, which is the diagnosis INS-642 lacked.
  const progress = { table: "connect" };
  const sweep = sweepUnderServiceAccess(sql, sentinel, progress);
  // The deadline can win the race below; keep the loser's rejection from surfacing unhandled.
  sweep.catch(() => undefined);
  let expiry: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sweep,
      new Promise<never>((_resolve, reject) => {
        expiry = setTimeout(() => {
          reject(
            new Error(
              `Plaintext sweep: exceeded its ${String(SWEEP_DEADLINE_MS)}ms deadline at ${progress.table}`,
            ),
          );
        }, SWEEP_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(expiry);
    await sql.end({ timeout: END_TIMEOUT_SECONDS });
  }
}

async function sweepUnderServiceAccess(
  sql: ReturnType<typeof postgres>,
  sentinel: Sentinel,
  progress: { table: string },
): Promise<PlaintextSweepResult> {
  return sql.begin(async (tx) => {
    // Transaction-local Service Access scope, the ADR-0037 engine gate, matching
    // `packages/tenant-store/src/apply-tenant-scope.ts`. This is the structural half of the fix: a
    // dropped connection rejects the whole transaction rather than silently continuing on a
    // reconnected session that carries no scope, which is how the session-scoped version could report
    // a clean database it never read.
    await tx`SELECT set_config('app.service', 'true', true)`;
    progress.table = "schema";
    const columns = await listTextualColumns(tx);
    const protectedTables = await listForceRlsTables(tx);
    const sweep = await sweepPostgresColumns(tx, { columns, protectedTables }, sentinel, progress);
    assertSweepReadRows(sweep.observations);
    return { columnCount: columns.length, hits: sweep.hits, rowsObserved: sweep.rowsObserved };
  });
}

/**
 * The evidential half of the fix. Service Access is the only thing making forced-RLS tables visible,
 * so reading zero rows from every one of them is exactly what a lost scope looks like: `bool_or`
 * aggregates to NULL, no hit is possible, and the gate reports a clean database it never read.
 *
 * A total row count cannot stand in for this. `instances`, `instance_operators`, `user_admissions`,
 * and `instance_configurations` are absent from the FORCE-RLS block in
 * `packages/tenant-store/sql/policies-and-roles.sql`, and the preview smoke seeds them immediately
 * before the run, so the total stays positive either way.
 */
export function assertSweepReadRows(observations: readonly SweepObservation[]): void {
  const protectedTables = observations.filter((observation) => observation.protectedByRls);
  const totalRows = observations.reduce((total, observation) => total + observation.rowCount, 0);
  if (totalRows === 0) {
    throw new Error(
      `Plaintext sweep: scanned ${String(observations.length)} table(s) but observed zero rows, so the sweep proved nothing`,
    );
  }
  if (protectedTables.length === 0) {
    throw new Error(
      "Plaintext sweep: found no forced-RLS tables, so it cannot prove Service Access took effect",
    );
  }
  const protectedRows = protectedTables.reduce((total, table) => total + table.rowCount, 0);
  if (protectedRows === 0) {
    throw new Error(
      `Plaintext sweep: read zero rows from all ${String(protectedTables.length)} forced-RLS table(s), so Service Access did not take effect and RLS hid every row this gate must read`,
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
  schema: { columns: TextColumn[]; protectedTables: ReadonlySet<string> },
  sentinel: Sentinel,
  progress: { table: string },
): Promise<{ hits: SweepHit[]; observations: SweepObservation[]; rowsObserved: number }> {
  const { columns, protectedTables } = schema;
  const hits: SweepHit[] = [];
  const observations: SweepObservation[] = [];
  let rowsObserved = 0;
  for (const [tableName, tableColumns] of groupColumnsByTable(columns)) {
    progress.table = tableName;
    const query = buildTableSweepQuery(tableName, tableColumns, sentinel.variants);
    const [row] = await sql.unsafe(query.text, query.parameters);
    if (row === undefined) {
      throw new Error(`Plaintext sweep: aggregate probe for ${tableName} returned no row`);
    }
    const rowCount = readRowCount(tableName, row);
    rowsObserved += rowCount;
    observations.push({ protectedByRls: protectedTables.has(tableName), rowCount, tableName });
    hits.push(...collectTableHits(tableName, query.probes, row));
  }
  return { hits, observations, rowsObserved };
}

/** The tables whose visibility depends on the Service Access scope this sweep just set. */
async function listForceRlsTables(sql: postgres.TransactionSql): Promise<ReadonlySet<string>> {
  const rows = await sql<{ tableName: string }[]>`
    SELECT c.relname AS "tableName"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relforcerowsecurity
  `;
  return new Set(rows.map((row) => row.tableName));
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
 * the query also returns the row count `assertSweepReadRows` uses to prove it actually read something.
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
