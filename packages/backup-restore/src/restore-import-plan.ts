import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";

import { RECOVERY_CANARY_ORGANIZATION_ID } from "./constants.js";
import {
  BACKUP_INSTANCE_EXPORT_TABLES,
  BACKUP_ORGANIZATION_EXPORT_TABLES,
} from "./export-tables.js";
import { RestoreImportError } from "./restore-import-error.js";
import type { BackupExportRow } from "./serialize-backup-row.js";
import type { BackupExportHeader } from "./types.js";

/**
 * Instance-scope import ordering (ADR-0084). `bootstrap_operator_claims` carries a NOT NULL FK
 * into `organizations`, so it is the one instance table that must import after the per-organization
 * transactions; every other instance table only references `instances` and imports first (the
 * `organizations -> instances` FK requires that order). Both phases run as `app.service`
 * transactions, preserving the export's scope shape in reverse.
 */
export const RESTORE_INSTANCE_TABLES_BEFORE_ORGANIZATIONS = BACKUP_INSTANCE_EXPORT_TABLES.filter(
  (tableName) => tableName !== "bootstrap_operator_claims",
);
export const RESTORE_INSTANCE_TABLES_AFTER_ORGANIZATIONS = ["bootstrap_operator_claims"] as const;

const INSTANCE_TABLE_SET = new Set<string>(BACKUP_INSTANCE_EXPORT_TABLES);
const ORGANIZATION_TABLE_SET = new Set<string>(BACKUP_ORGANIZATION_EXPORT_TABLES);

export interface RestoreImportPlan {
  readonly header: BackupExportHeader;
  /** Instance-scope rows in payload order (registry order within the export). */
  readonly instanceRows: readonly BackupExportRow[];
  /** Per-organization rows keyed by organization ID, in header snapshot order. */
  readonly organizationRows: ReadonlyMap<string, readonly BackupExportRow[]>;
  /**
   * Manifest organizations dropped as no-ops because their payload bucket was empty (ADR-0072
   * vanished-organization shape). Surfaced so a restore that silently dropped an organization is
   * self-evidencing in the journal and audit, sorted for a stable record. Opaque IDs only.
   */
  readonly prunedOrganizationIds: readonly string[];
  readonly totalRowCount: number;
}

function manifestError(message: string): RestoreImportError {
  return new RestoreImportError(BACKUP_RESTORE_ERROR_CODES.manifestIncomplete, message);
}

function manifestOrganizationIds(header: BackupExportHeader): string[] {
  const organizationIds = header.organization_snapshots.map((snapshot) => snapshot.organization_id);
  if (organizationIds.length !== new Set(organizationIds).size) {
    throw manifestError("backup header organization manifest contains duplicates");
  }
  if (!organizationIds.includes(RECOVERY_CANARY_ORGANIZATION_ID)) {
    throw manifestError(
      "backup artifact does not include the recovery-canary sentinel organization",
    );
  }
  return organizationIds;
}

/**
 * The export is not one transactional snapshot (ADR-0072): an organization deleted between
 * enumeration and its scoped read lands in the header manifest with zero payload rows. That
 * vanished-organization shape is tolerated as a no-op — except for the recovery-canary sentinel,
 * which is required standing state. A NON-empty bucket missing its organizations row is still an
 * incomplete manifest and fails closed.
 */
function pruneAndAssertOrganizationBuckets(
  organizationRows: Map<string, BackupExportRow[]>,
): string[] {
  const prunedOrganizationIds: string[] = [];
  for (const [organizationId, bucket] of organizationRows) {
    if (bucket.length === 0) {
      if (organizationId === RECOVERY_CANARY_ORGANIZATION_ID) {
        throw manifestError(
          "backup artifact carries no rows for the recovery-canary sentinel organization",
        );
      }
      organizationRows.delete(organizationId);
      prunedOrganizationIds.push(organizationId);
      continue;
    }
    const hasOrganizationRow = bucket.some(
      (row) => row.table === "organizations" && row.id === organizationId,
    );
    if (!hasOrganizationRow) {
      throw manifestError(
        "header manifest names an organization with no organizations row in the payload",
      );
    }
  }
  return prunedOrganizationIds.sort();
}

/**
 * Groups an opened payload into import scopes and fails closed on any manifest gap BEFORE the
 * first row is written: unknown tables (an artifact from a newer, unsupported export version),
 * rows outside the header's organization manifest, manifest organizations with no rows, and a
 * missing recovery-canary sentinel organization (the ADR-0084 evidence venue).
 */
export function buildRestoreImportPlan(
  header: BackupExportHeader,
  rows: readonly BackupExportRow[],
): RestoreImportPlan {
  const instanceRows: BackupExportRow[] = [];
  const organizationRows = new Map<string, BackupExportRow[]>(
    manifestOrganizationIds(header).map((organizationId) => [organizationId, []]),
  );

  for (const row of rows) {
    const tableName = row.table;
    if (INSTANCE_TABLE_SET.has(tableName)) {
      instanceRows.push(row);
      continue;
    }
    if (!ORGANIZATION_TABLE_SET.has(tableName)) {
      throw new RestoreImportError(
        BACKUP_RESTORE_ERROR_CODES.unsupportedTable,
        "backup artifact names a table outside the export-table registry",
      );
    }
    const organizationId = row.organization_id;
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      throw manifestError("organization-scope row is missing its organization identity");
    }
    const bucket = organizationRows.get(organizationId);
    if (bucket === undefined) {
      throw manifestError("payload row names an organization absent from the header manifest");
    }
    bucket.push(row);
  }

  const prunedOrganizationIds = pruneAndAssertOrganizationBuckets(organizationRows);

  return {
    header,
    instanceRows,
    organizationRows,
    prunedOrganizationIds,
    totalRowCount: rows.length,
  };
}
