import type { BackupExportTable } from "./export-tables.js";

export interface BackupExportRow {
  table: BackupExportTable;
  organization_id?: string;
  [key: string]: unknown;
}

export function serializeBackupRow(
  table: BackupExportTable,
  row: Record<string, unknown>,
): BackupExportRow {
  const organizationId =
    typeof row.org_id === "string"
      ? row.org_id
      : table === "organizations" && typeof row.id === "string"
        ? row.id
        : undefined;

  return {
    table,
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...row,
  };
}

export function encodeBackupJsonlLine(row: BackupExportRow): string {
  return `${JSON.stringify(row)}\n`;
}
