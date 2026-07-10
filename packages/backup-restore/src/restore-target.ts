import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";
import {
  isUniqueConstraintViolation,
  withTenantScope,
  type TenantScopedSql,
} from "@insecur/tenant-store";

import {
  BACKUP_INSTANCE_EXPORT_TABLES,
  BACKUP_ORGANIZATION_EXPORT_TABLES,
} from "./export-tables.js";
import { RestoreImportError } from "./restore-import-error.js";

export const RESTORE_IMPORT_JOURNAL_TABLE = "restore_import_journal" as const;

/**
 * Session-scoped exclusion key for the restore target (ADR-0084). Transaction-scoped so an aborted
 * import can never leak a held lock; the journal's singleton primary key remains the durable
 * exclusion record even if two callers race on different Postgres sessions.
 */
const RESTORE_IMPORT_ADVISORY_LOCK_KEY = "840084565";

/** `table -> column -> udt_name` for every public table on the restore target. */
export type RestoreTargetColumnTypes = ReadonlyMap<string, ReadonlyMap<string, string>>;

async function readRestoreTargetColumnTypes(
  sql: TenantScopedSql,
): Promise<RestoreTargetColumnTypes> {
  const rows = (await sql.unsafe(
    `SELECT table_name, column_name, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public'`,
  )) as { table_name: string; column_name: string; udt_name: string }[];
  const byTable = new Map<string, Map<string, string>>();
  for (const row of rows) {
    const columns = byTable.get(row.table_name) ?? new Map<string, string>();
    columns.set(row.column_name, row.udt_name);
    byTable.set(row.table_name, columns);
  }
  return byTable;
}

async function countRows(sql: TenantScopedSql, tableName: string): Promise<number> {
  const rows = (await sql.unsafe(`SELECT COUNT(*)::int AS count FROM "${tableName}"`)) as {
    count: number;
  }[];
  return rows[0]?.count ?? 0;
}

/**
 * Fresh-target proof (ADR-0084): schema migrations applied (every export-registry table plus the
 * import journal exists), the journal is present but empty, `instance_identity_configurations` is
 * empty, and zero organizations exist. Any non-empty target fails closed with no writes.
 */
async function assertRestoreTargetFresh(
  sql: TenantScopedSql,
  columnTypes: RestoreTargetColumnTypes,
): Promise<void> {
  const requiredTables = [
    ...BACKUP_INSTANCE_EXPORT_TABLES,
    ...BACKUP_ORGANIZATION_EXPORT_TABLES,
    RESTORE_IMPORT_JOURNAL_TABLE,
  ];
  for (const tableName of requiredTables) {
    if (!columnTypes.has(tableName)) {
      throw new RestoreImportError(
        BACKUP_RESTORE_ERROR_CODES.schemaMismatch,
        "restore target is missing a migrated table required by the export registry",
      );
    }
  }

  const notFresh = (message: string) =>
    new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.targetNotFresh, message);
  if ((await countRows(sql, RESTORE_IMPORT_JOURNAL_TABLE)) > 0) {
    throw notFresh("restore target already carries an import journal marker");
  }
  if ((await countRows(sql, "instance_identity_configurations")) > 0) {
    throw notFresh("restore target already carries an instance identity configuration");
  }
  if ((await countRows(sql, "organizations")) > 0) {
    throw notFresh("restore target already contains organizations");
  }
}

export interface ArmRestoreTargetInput {
  readonly instanceId: string;
  readonly artifactRef: string;
  readonly sourceExportOperationId: string;
  readonly sourceExportTimestamp: string;
}

/**
 * The ADR-0084 exclusion construction, in its normative order and in one `app.service`
 * transaction: (1) acquire the exclusion primitive — a transaction-scoped advisory lock, with the
 * journal singleton insert as the equivalent durable unique-constraint guard — failing closed
 * immediately when it cannot be acquired; (2) run the fresh-target proof; (3) transactionally
 * write the instance-scope journal marker recording the artifact, its source export Operation,
 * the artifact's export timestamp, and the start time. Only after this commits may rows import.
 */
export async function armRestoreTarget(
  input: ArmRestoreTargetInput,
): Promise<RestoreTargetColumnTypes> {
  return await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const lockRows = (await sql.unsafe(
      `SELECT pg_try_advisory_xact_lock(${RESTORE_IMPORT_ADVISORY_LOCK_KEY}) AS acquired`,
    )) as { acquired: boolean }[];
    if (lockRows[0]?.acquired !== true) {
      throw new RestoreImportError(
        BACKUP_RESTORE_ERROR_CODES.importConflict,
        "another restore import holds the target's exclusion lock",
      );
    }

    const columnTypes = await readRestoreTargetColumnTypes(sql);
    await assertRestoreTargetFresh(sql, columnTypes);

    try {
      await sql.unsafe(
        `INSERT INTO "${RESTORE_IMPORT_JOURNAL_TABLE}"
           (only_row, instance_id, artifact_ref, source_export_operation_id,
            source_export_timestamp, status)
         VALUES (true, $1, $2, $3, $4, 'running')`,
        [
          input.instanceId,
          input.artifactRef,
          input.sourceExportOperationId,
          input.sourceExportTimestamp,
        ],
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new RestoreImportError(
          BACKUP_RESTORE_ERROR_CODES.importConflict,
          "the restore target has already been claimed by an import journal marker",
        );
      }
      throw error;
    }
    return columnTypes;
  });
}

export interface CompleteRestoreJournalInput {
  readonly status: "succeeded" | "failed";
  readonly organizationCount?: number;
  readonly importedRowCount?: number;
}

/** Terminal journal update; the singleton row is the durable per-target import record. */
export async function completeRestoreJournal(input: CompleteRestoreJournalInput): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql.unsafe(
      `UPDATE "${RESTORE_IMPORT_JOURNAL_TABLE}"
       SET status = $1,
           completed_at = now(),
           organization_count = $2,
           imported_row_count = $3
       WHERE only_row = true AND status = 'running'`,
      [input.status, input.organizationCount ?? null, input.importedRowCount ?? null],
    );
  });
}
