import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

import { assertBackupExportTableName, type BackupExportTable } from "./export-tables.js";
import { RestoreImportError } from "./restore-import-error.js";
import type { RestoreTargetColumnTypes } from "./restore-target.js";
import type { BackupExportRow } from "./serialize-backup-row.js";

/** Serialized rows only ever carry registry column names; anything else is schema drift. */
const SAFE_COLUMN_NAME = /^[a-z_][a-z0-9_]*$/;
const JSON_UDT_NAMES = new Set(["json", "jsonb"]);

function schemaMismatch(tableName: string): RestoreImportError {
  return new RestoreImportError(
    BACKUP_RESTORE_ERROR_CODES.schemaMismatch,
    `exported ${tableName} rows do not fit the restore target's migrated schema`,
  );
}

function rowColumnEntries(
  row: BackupExportRow,
  tableName: BackupExportTable,
  tableColumns: ReadonlyMap<string, string>,
): [string, unknown][] {
  return Object.entries(row).filter(([key]) => {
    if (key === "table") {
      return false;
    }
    // serializeBackupRow duplicates the tenant key as `organization_id` for grouping; drop it
    // unless the table really carries that column (none do today).
    if (key === "organization_id" && !tableColumns.has(key)) {
      return false;
    }
    return true;
  });
}

function bindValue(value: unknown, udtName: string | undefined): unknown {
  // json/jsonb round-trips through the JSONL export as parsed values; re-serialize the whole
  // value (including top-level strings and JSON null) so the server-side cast sees valid JSON
  // text. The export driver parses json columns, so a stored JSON null and SQL NULL both arrive
  // here as `null`; re-serializing to JSON null preserves the JSON-valued reading instead of
  // collapsing every stored JSON null to SQL NULL.
  if (udtName !== undefined && JSON_UDT_NAMES.has(udtName)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Inserts exported rows into one registry table on the restore target, preserving every column
 * value exactly as serialized — ciphertext and wrapped key material are copied, never decrypted
 * (ADR-0084). Fails closed on any column the migrated target does not declare, which is what makes
 * an artifact from an unknown newer schema version refuse before violating the target's shape.
 */
export async function insertRestoreRows(
  sql: TenantScopedSql,
  tableName: BackupExportTable,
  rows: readonly BackupExportRow[],
  columnTypes: RestoreTargetColumnTypes,
): Promise<number> {
  assertBackupExportTableName(tableName);
  const tableColumns = columnTypes.get(tableName);
  if (tableColumns === undefined) {
    throw schemaMismatch(tableName);
  }

  for (const row of rows) {
    const entries = rowColumnEntries(row, tableName, tableColumns);
    if (entries.length === 0) {
      throw schemaMismatch(tableName);
    }
    const columnNames: string[] = [];
    const parameters: unknown[] = [];
    for (const [columnName, value] of entries) {
      if (!SAFE_COLUMN_NAME.test(columnName) || !tableColumns.has(columnName)) {
        throw schemaMismatch(tableName);
      }
      columnNames.push(`"${columnName}"`);
      parameters.push(bindValue(value, tableColumns.get(columnName)));
    }
    const placeholders = columnNames.map((_, index) => `$${String(index + 1)}`);
    await sql.unsafe(
      `INSERT INTO "${tableName}" (${columnNames.join(", ")}) VALUES (${placeholders.join(", ")})`,
      parameters as never[],
    );
  }
  return rows.length;
}
