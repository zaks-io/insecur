import type { TenantScopedSql } from "@insecur/tenant-store";

import { assertBackupExportTableName, type BackupExportTable } from "./export-tables.js";

export async function readExportTableRows(
  sql: TenantScopedSql,
  tableName: BackupExportTable,
): Promise<Record<string, unknown>[]> {
  assertBackupExportTableName(tableName);
  return (await sql.unsafe(`SELECT * FROM "${tableName}"`)) as Record<string, unknown>[];
}
