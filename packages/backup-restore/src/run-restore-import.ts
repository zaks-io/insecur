import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  isMetadataSafeOpaqueTokenString,
  organizationId as brandOrganizationId,
  type OperationId,
} from "@insecur/domain";
import { BACKUP_RESTORE_ERROR_CODES } from "@insecur/domain";
import { createOperation, OPERATION_INTENT_CODES, transitionOperation } from "@insecur/operations";
import { withTenantScope, type TenantScopedSql } from "@insecur/tenant-store";

import type { BackupExportStorage } from "./backup-export-storage.js";
import { RECOVERY_CANARY_ORGANIZATION_ID } from "./constants.js";
import { BACKUP_ORGANIZATION_EXPORT_TABLES, type BackupExportTable } from "./export-tables.js";
import { insertRestoreRows } from "./insert-restore-rows.js";
import { importedOrganizationKeys, partitionInstanceRows } from "./restore-instance-partition.js";
import { RestoreImportError } from "./restore-import-error.js";
import {
  RESTORE_INSTANCE_TABLES_AFTER_ORGANIZATIONS,
  RESTORE_INSTANCE_TABLES_BEFORE_ORGANIZATIONS,
} from "./restore-import-plan.js";
import {
  armRestoreTarget,
  completeRestoreJournal,
  type RestoreTargetColumnTypes,
} from "./restore-target.js";
import type { BackupExportRow } from "./serialize-backup-row.js";
import { verifyRestoreArtifact, type VerifiedRestoreArtifact } from "./verify-restore-artifact.js";
import type { RestoreImportSuccess } from "./types.js";

export interface RunRestoreImportInput {
  readonly artifactRef: string;
  readonly expectedInstanceId: string;
  readonly expectedRootKeyVersion: number;
  readonly boundRootKeyVersions: readonly number[];
  readonly rootKeyBytes: Uint8Array;
  readonly storage: BackupExportStorage;
  /** Test seam: runs inside each organization's import transaction, after its rows. */
  readonly onOrganizationImported?: (organizationId: string) => void | Promise<void>;
}

function buildRestoreImportIdempotencyKey(exportIdentity: string): string {
  const key = `backup.restore_import.${exportIdentity}`;
  if (!isMetadataSafeOpaqueTokenString(key)) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.artifactInvalid,
      "restore import identity is not a metadata-safe opaque token",
    );
  }
  return key;
}

function groupRowsByTable(
  rows: readonly BackupExportRow[],
): ReadonlyMap<BackupExportTable, BackupExportRow[]> {
  const byTable = new Map<BackupExportTable, BackupExportRow[]>();
  for (const row of rows) {
    const bucket = byTable.get(row.table) ?? [];
    bucket.push(row);
    byTable.set(row.table, bucket);
  }
  return byTable;
}

async function importTablesInScope(
  sql: TenantScopedSql,
  tables: readonly BackupExportTable[],
  rowsByTable: ReadonlyMap<BackupExportTable, readonly BackupExportRow[]>,
  columnTypes: RestoreTargetColumnTypes,
): Promise<number> {
  // The export registry orders FK parents before children; the four cyclic or forward-referencing
  // constraints are DEFERRABLE (see policies-and-roles.sql) so the whole scope checks at COMMIT.
  await sql.unsafe("SET CONSTRAINTS ALL DEFERRED");
  let importedRowCount = 0;
  for (const tableName of tables) {
    const rows = rowsByTable.get(tableName);
    if (rows !== undefined && rows.length > 0) {
      importedRowCount += await insertRestoreRows(sql, tableName, rows, columnTypes);
    }
  }
  return importedRowCount;
}

interface ImportScopesResult {
  readonly importedRowCount: number;
  readonly droppedBootstrapClaimCount: number;
}

async function importAllScopes(
  input: RunRestoreImportInput,
  verified: VerifiedRestoreArtifact,
  columnTypes: RestoreTargetColumnTypes,
): Promise<ImportScopesResult> {
  // Drop torn-read orphan bootstrap claims BEFORE any write, using only the imported org set, so
  // the AFTER-organizations phase never violates the composite FK to organizations.
  const { importableRows, droppedBootstrapClaimCount } = partitionInstanceRows(
    verified.plan.instanceRows,
    importedOrganizationKeys(verified.plan),
  );
  const instanceRowsByTable = groupRowsByTable(importableRows);

  let importedRowCount = await withTenantScope({ kind: "service" }, ({ sql }) =>
    importTablesInScope(
      sql,
      RESTORE_INSTANCE_TABLES_BEFORE_ORGANIZATIONS,
      instanceRowsByTable,
      columnTypes,
    ),
  );

  // Each organization is fully present or fully absent, never torn (ADR-0084): its rows and the
  // injected post-import hook run inside one forced-RLS organization transaction.
  for (const [organizationIdValue, rows] of verified.plan.organizationRows) {
    const rowsByTable = groupRowsByTable(rows);
    importedRowCount += await withTenantScope(
      { kind: "organization", organizationId: brandOrganizationId.brand(organizationIdValue) },
      async ({ sql }) => {
        const count = await importTablesInScope(
          sql,
          BACKUP_ORGANIZATION_EXPORT_TABLES,
          rowsByTable,
          columnTypes,
        );
        await input.onOrganizationImported?.(organizationIdValue);
        return count;
      },
    );
  }

  importedRowCount += await withTenantScope({ kind: "service" }, ({ sql }) =>
    importTablesInScope(
      sql,
      RESTORE_INSTANCE_TABLES_AFTER_ORGANIZATIONS,
      instanceRowsByTable,
      columnTypes,
    ),
  );

  return { importedRowCount, droppedBootstrapClaimCount };
}

/**
 * Retroactive terminal `backup.restore_import` Operation plus success audit under the
 * recovery-canary sentinel organization (ADR-0084). A pending/running row cannot exist during the
 * import — the fresh-target proof requires zero organizations at start, so the instance-scope
 * journal is the in-flight record and this Operation is written only once the canary
 * organization's rows exist in the target.
 */
interface RestoreImportCounts {
  readonly organizationCount: number;
  readonly manifestOrganizationCount: number;
  readonly skippedOrganizationCount: number;
  readonly droppedBootstrapClaimCount: number;
  readonly importedRowCount: number;
}

async function recordRestoreImportEvidence(
  verified: VerifiedRestoreArtifact,
  counts: RestoreImportCounts,
): Promise<OperationId> {
  const canaryOrganizationId = brandOrganizationId.brand(RECOVERY_CANARY_ORGANIZATION_ID);
  const idempotencyKey = buildRestoreImportIdempotencyKey(verified.exportIdentity);
  const created = await createOperation({
    organizationId: canaryOrganizationId,
    intentCode: OPERATION_INTENT_CODES.backupRestoreImport,
    idempotencyKey,
  });
  const operationId = created.operation.operationId;
  await transitionOperation({
    organizationId: canaryOrganizationId,
    operationId,
    nextState: "running",
    idempotencyKey,
  });

  const sourceExportTimestampMs = Date.parse(verified.sourceExportTimestamp);
  const audit = await writeAuditEvent({
    organizationId: canaryOrganizationId,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.backupRestoreImportSucceeded,
    outcome: "success",
    actor: { type: "user", userId: null },
    resource: { type: "operation", id: brandOpaqueResourceIdForPrefix("op", operationId) },
    operation: { operationId },
    // Metadata-safe detail values only (stable codes, opaque IDs, numbers): the artifact's
    // export timestamp rides as epoch millis and the artifact_ref itself lives in the journal row.
    details: {
      source_export_operation_id: verified.sourceExportOperationId,
      source_export_timestamp_ms: Number.isFinite(sourceExportTimestampMs)
        ? sourceExportTimestampMs
        : null,
      organization_count: counts.organizationCount,
      manifest_organization_count: counts.manifestOrganizationCount,
      skipped_organization_count: counts.skippedOrganizationCount,
      dropped_bootstrap_claim_count: counts.droppedBootstrapClaimCount,
      imported_row_count: counts.importedRowCount,
    },
  });

  await transitionOperation({
    organizationId: canaryOrganizationId,
    operationId,
    nextState: "succeeded",
    idempotencyKey,
    progress: { auditEventIds: [audit.auditEventId] },
  });
  return operationId;
}

async function markJournalFailedQuietly(): Promise<void> {
  try {
    await completeRestoreJournal({ status: "failed" });
  } catch {
    // The operator discards a failed target wholesale (ADR-0084); a lost failure mark on an
    // unreachable target must not mask the original import error.
  }
}

/**
 * Imports one authenticated scheduled R2 export into a fresh migrated restore target (ADR-0084).
 * Every store call in scope resolves to the armed `RESTORE_DB` connection the caller established;
 * nothing here decrypts a Sensitive Value and nothing returns row payloads.
 */
export async function runRestoreImport(
  input: RunRestoreImportInput,
): Promise<RestoreImportSuccess> {
  const verified = await verifyRestoreArtifact({
    storage: input.storage,
    artifactRef: input.artifactRef,
    expectedInstanceId: input.expectedInstanceId,
    expectedRootKeyVersion: input.expectedRootKeyVersion,
    boundRootKeyVersions: input.boundRootKeyVersions,
    rootKeyBytes: input.rootKeyBytes,
  });

  const columnTypes = await armRestoreTarget({
    instanceId: input.expectedInstanceId,
    artifactRef: input.artifactRef,
    sourceExportOperationId: verified.sourceExportOperationId,
    sourceExportTimestamp: verified.sourceExportTimestamp,
  });

  try {
    const { importedRowCount, droppedBootstrapClaimCount } = await importAllScopes(
      input,
      verified,
      columnTypes,
    );
    const skippedOrganizationIds = verified.plan.prunedOrganizationIds;
    const organizationCount = verified.plan.organizationRows.size;
    const skippedOrganizationCount = skippedOrganizationIds.length;
    const manifestOrganizationCount = organizationCount + skippedOrganizationCount;
    const counts: RestoreImportCounts = {
      organizationCount,
      manifestOrganizationCount,
      skippedOrganizationCount,
      droppedBootstrapClaimCount,
      importedRowCount,
    };
    // Evidence ordering (ADR-0084): the success audit is written first, then the journal is marked
    // succeeded. The journal row is the AUTHORITATIVE outcome record — a crash between these two
    // writes can leave a success audit beside a still-`running` journal in a target the operator
    // then discards, so a success audit is never on its own proof of a completed import.
    const operationId = await recordRestoreImportEvidence(verified, counts);
    await completeRestoreJournal({ status: "succeeded", ...counts });
    return {
      status: "succeeded",
      instance_id: input.expectedInstanceId,
      artifact_ref: input.artifactRef,
      source_export_operation_id: verified.sourceExportOperationId,
      source_export_timestamp: verified.sourceExportTimestamp,
      organization_count: organizationCount,
      manifest_organization_count: manifestOrganizationCount,
      skipped_organization_count: skippedOrganizationCount,
      skipped_organization_ids: skippedOrganizationIds,
      dropped_bootstrap_claim_count: droppedBootstrapClaimCount,
      imported_row_count: importedRowCount,
      operation_id: String(operationId),
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    await markJournalFailedQuietly();
    if (error instanceof RestoreImportError) {
      throw error;
    }
    // Driver errors can echo row values in their messages; never let them cross the seam.
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.importFailed,
      "restore import failed before completion; discard the target and retry on a fresh one",
      { cause: error },
    );
  }
}
