import type { OrganizationId } from "@insecur/domain";
import { withTenantScope, type TenantScopedSql } from "@insecur/tenant-store";

import {
  BACKUP_INSTANCE_EXPORT_TABLES,
  BACKUP_ORGANIZATION_EXPORT_TABLES,
  type BackupExportTable,
} from "./export-tables.js";
import { readExportTableRows } from "./read-export-table-rows.js";
import { encodeBackupJsonlLine, serializeBackupRow } from "./serialize-backup-row.js";
import type { BackupExportOrganizationSnapshot } from "./types.js";

const BACKUP_EXPORT_TRANSACTION_OPTIONS = {
  isolationLevel: "repeatable read",
  readOnly: true,
  captureSnapshotAt: true,
} as const;

interface BackupExportReadOptions {
  readonly afterTableRead?: (tableName: BackupExportTable) => Promise<void>;
}

function requireSnapshotAt(snapshotAt: string | undefined): string {
  if (snapshotAt === undefined) {
    throw new Error("backup export transaction snapshot timestamp is missing");
  }
  return snapshotAt;
}

async function appendTableRows(
  chunks: string[],
  sql: TenantScopedSql,
  tableName: BackupExportTable,
  options: BackupExportReadOptions,
): Promise<void> {
  const rows = await readExportTableRows(sql, tableName);
  for (const row of rows) {
    chunks.push(encodeBackupJsonlLine(serializeBackupRow(tableName, row)));
  }
  if (options.afterTableRead) {
    await options.afterTableRead(tableName);
  }
}

export async function buildInstanceScopeJsonlLines(
  options: BackupExportReadOptions = {},
): Promise<{ lines: string[]; snapshotAt: string }> {
  const lines: string[] = [];
  const snapshotAt = await withTenantScope(
    { kind: "service" },
    async ({ sql, snapshotAt }) => {
      for (const tableName of BACKUP_INSTANCE_EXPORT_TABLES) {
        await appendTableRows(lines, sql, tableName, options);
      }
      return requireSnapshotAt(snapshotAt);
    },
    BACKUP_EXPORT_TRANSACTION_OPTIONS,
  );
  return { lines, snapshotAt };
}

export async function buildOrganizationScopeJsonlLines(
  organizationId: OrganizationId,
  options: BackupExportReadOptions = {},
): Promise<{ lines: string[]; snapshot: BackupExportOrganizationSnapshot }> {
  const lines: string[] = [];
  const snapshotAt = await withTenantScope(
    { kind: "organization", organizationId },
    async ({ sql, snapshotAt }) => {
      for (const tableName of BACKUP_ORGANIZATION_EXPORT_TABLES) {
        await appendTableRows(lines, sql, tableName, options);
      }
      return requireSnapshotAt(snapshotAt);
    },
    BACKUP_EXPORT_TRANSACTION_OPTIONS,
  );
  return {
    lines,
    snapshot: { organization_id: String(organizationId), snapshot_at: snapshotAt },
  };
}

export function concatJsonlLines(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.join(""));
}
