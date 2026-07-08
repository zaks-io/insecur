import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

import {
  BACKUP_INSTANCE_EXPORT_TABLES,
  BACKUP_ORGANIZATION_EXPORT_TABLES,
} from "./export-tables.js";
import { readExportTableRows } from "./read-export-table-rows.js";
import { encodeBackupJsonlLine, serializeBackupRow } from "./serialize-backup-row.js";
import type { BackupExportOrganizationSnapshot } from "./types.js";
import { withTenantScope } from "@insecur/tenant-store";

async function appendTableRows(
  chunks: string[],
  sql: TenantScopedSql,
  tableName: (typeof BACKUP_INSTANCE_EXPORT_TABLES)[number],
): Promise<void> {
  const rows = await readExportTableRows(sql, tableName);
  for (const row of rows) {
    chunks.push(encodeBackupJsonlLine(serializeBackupRow(tableName, row)));
  }
}

export async function buildInstanceScopeJsonlLines(): Promise<string[]> {
  const lines: string[] = [];
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    for (const tableName of BACKUP_INSTANCE_EXPORT_TABLES) {
      await appendTableRows(lines, sql, tableName);
    }
  });
  return lines;
}

export async function buildOrganizationScopeJsonlLines(
  organizationId: OrganizationId,
  snapshotAt: string,
): Promise<{ lines: string[]; snapshot: BackupExportOrganizationSnapshot }> {
  const lines: string[] = [];
  await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    for (const tableName of BACKUP_ORGANIZATION_EXPORT_TABLES) {
      const rows = await readExportTableRows(sql, tableName);
      for (const row of rows) {
        lines.push(encodeBackupJsonlLine(serializeBackupRow(tableName, row)));
      }
    }
  });
  return {
    lines,
    snapshot: { organization_id: String(organizationId), snapshot_at: snapshotAt },
  };
}

export function concatJsonlLines(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.join(""));
}
