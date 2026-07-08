import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import { DEFAULT_ROOT_KEY_VERSION } from "@insecur/crypto";
import {
  brandOpaqueResourceIdForPrefix,
  organizationId as brandOrganizationId,
  type OperationId,
  type OrganizationId,
} from "@insecur/domain";
import {
  createOperation,
  OPERATION_INTENT_CODES,
  transitionOperation,
  type OperationMutationResult,
} from "@insecur/operations";

import { openBackupArtifact, sealBackupArtifact } from "./backup-envelope.js";
import { validateBackupEncryptionConfig } from "./backup-encryption-config.js";
import { writeBackupExportArtifacts, type BackupExportStorage } from "./backup-export-storage.js";
import { buildBackupExportIdempotencyKey } from "./build-backup-idempotency-key.js";
import {
  buildInstanceScopeJsonlLines,
  buildOrganizationScopeJsonlLines,
  concatJsonlLines,
} from "./build-backup-jsonl-payload.js";
import { RECOVERY_CANARY_ORGANIZATION_ID } from "./constants.js";
import { enumerateOrganizationIds } from "./enumerate-organization-ids.js";
import { computeExportExpiresAt } from "./evaluate-readiness.js";
import { resolveExportInstanceId } from "./resolve-export-instance-id.js";
import type { BackupExportOrganizationSnapshot, BackupExportSuccessEvidence } from "./types.js";

export interface RunBackupExportInput {
  scheduledAt: Date;
  rootKeyBytes: Uint8Array;
  storage: BackupExportStorage;
  organizationId?: OrganizationId;
  instanceId?: string;
  rootKeyVersion?: number;
  onExportFailureAlert?: () => void;
}

export interface RunBackupExportResult {
  created: boolean;
  operation: OperationMutationResult["operation"];
  exportEvidence?: BackupExportSuccessEvidence;
}

async function buildBackupJsonlPayload(organizationIds: readonly string[]): Promise<{
  jsonlPayload: Uint8Array;
  organizationSnapshots: BackupExportOrganizationSnapshot[];
}> {
  const lines = await buildInstanceScopeJsonlLines();
  const organizationSnapshots: BackupExportOrganizationSnapshot[] = [];

  for (const organizationIdValue of organizationIds) {
    const snapshotAt = new Date().toISOString();
    const scoped = await buildOrganizationScopeJsonlLines(
      brandOrganizationId.brand(organizationIdValue),
      snapshotAt,
    );
    lines.push(...scoped.lines);
    organizationSnapshots.push(scoped.snapshot);
  }

  return {
    jsonlPayload: concatJsonlLines(lines),
    organizationSnapshots,
  };
}

function buildExportSuccessEvidence(input: {
  instanceId: string;
  exportTimestamp: string;
  rootKeyVersion: number;
  organizationCount: number;
  operationId: string;
  encryptionVerified: boolean;
}): BackupExportSuccessEvidence {
  return {
    status: input.encryptionVerified ? "passed" : "failed",
    checked_at: input.exportTimestamp,
    instance_id: input.instanceId,
    export_timestamp: input.exportTimestamp,
    root_key_version: input.rootKeyVersion,
    organization_count: input.organizationCount,
    artifact_ref: "backup/latest-export.ibkp",
    encryption_verified: input.encryptionVerified,
    expires_at: computeExportExpiresAt(input.exportTimestamp),
    operation_id: input.operationId,
  };
}

async function recordBackupExportAuditEvent(input: {
  organizationId: OrganizationId;
  operationId: OperationId;
  succeeded: boolean;
}) {
  return await writeAuditEvent({
    organizationId: input.organizationId,
    eventCode: input.succeeded
      ? PRODUCTION_AUDIT_EVENT_CODES.backupExportSucceeded
      : PRODUCTION_AUDIT_EVENT_CODES.backupExportFailed,
    outcome: "success",
    actor: { type: "user", userId: null },
    resource: {
      type: "operation",
      id: brandOpaqueResourceIdForPrefix("op", input.operationId),
    },
    operation: { operationId: input.operationId },
  });
}

async function sealAndStoreBackupArtifact(input: {
  instanceId: string;
  exportTimestamp: string;
  rootKeyBytes: Uint8Array;
  rootKeyVersion: number;
  organizationSnapshots: BackupExportOrganizationSnapshot[];
  jsonlPayload: Uint8Array;
  storage: BackupExportStorage;
  operationId: OperationId;
}): Promise<BackupExportSuccessEvidence> {
  const sealedArtifact = await sealBackupArtifact({
    instanceId: input.instanceId,
    exportTimestamp: input.exportTimestamp,
    rootKeyBytes: input.rootKeyBytes,
    rootKeyVersion: input.rootKeyVersion,
    jsonlPayload: input.jsonlPayload,
    organizationSnapshots: input.organizationSnapshots,
  });

  const opened = await openBackupArtifact({
    instanceId: input.instanceId,
    rootKeyBytes: input.rootKeyBytes,
    sealedBytes: sealedArtifact,
  });
  const encryptionCheck = validateBackupEncryptionConfig(opened.header, input.exportTimestamp);
  const exportEvidence = buildExportSuccessEvidence({
    instanceId: input.instanceId,
    exportTimestamp: input.exportTimestamp,
    rootKeyVersion: input.rootKeyVersion,
    organizationCount: input.organizationSnapshots.length,
    operationId: input.operationId,
    encryptionVerified: encryptionCheck.status === "passed",
  });

  await writeBackupExportArtifacts(input.storage, { sealedArtifact, exportEvidence });
  return exportEvidence;
}

async function markBackupExportFailed(input: {
  organizationId: OrganizationId;
  operationId: OperationId;
  idempotencyKey: string;
  onExportFailureAlert?: () => void;
}): Promise<void> {
  if (input.onExportFailureAlert) {
    input.onExportFailureAlert();
  }
  await recordBackupExportAuditEvent({
    organizationId: input.organizationId,
    operationId: input.operationId,
    succeeded: false,
  });
  await transitionOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
    nextState: "failed",
    idempotencyKey: input.idempotencyKey,
  });
}

async function executeBackupExport(input: {
  organizationId: OrganizationId;
  operationId: OperationId;
  scheduledAt: Date;
  idempotencyKey: string;
  rootKeyBytes: Uint8Array;
  rootKeyVersion: number;
  storage: BackupExportStorage;
  instanceId?: string;
}): Promise<RunBackupExportResult> {
  await transitionOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
    nextState: "running",
    idempotencyKey: input.idempotencyKey,
  });

  const instanceId = await resolveExportInstanceId(input.instanceId);
  const exportTimestamp = input.scheduledAt.toISOString();
  const organizationIds = await enumerateOrganizationIds();
  const { jsonlPayload, organizationSnapshots } = await buildBackupJsonlPayload(organizationIds);

  const exportEvidence = await sealAndStoreBackupArtifact({
    instanceId,
    exportTimestamp,
    rootKeyBytes: input.rootKeyBytes,
    rootKeyVersion: input.rootKeyVersion,
    organizationSnapshots,
    jsonlPayload,
    storage: input.storage,
    operationId: input.operationId,
  });

  const audit = await recordBackupExportAuditEvent({
    organizationId: input.organizationId,
    operationId: input.operationId,
    succeeded: true,
  });

  const succeeded = await transitionOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
    nextState: "succeeded",
    idempotencyKey: input.idempotencyKey,
    progress: { auditEventIds: [audit.auditEventId] },
  });

  return {
    created: true,
    operation: succeeded.operation,
    exportEvidence,
  };
}

export async function runBackupExport(input: RunBackupExportInput): Promise<RunBackupExportResult> {
  const organizationId = input.organizationId ?? RECOVERY_CANARY_ORGANIZATION_ID;
  const idempotencyKey = buildBackupExportIdempotencyKey(input.scheduledAt);
  const created = await createOperation({
    organizationId,
    intentCode: OPERATION_INTENT_CODES.backupExport,
    idempotencyKey,
  });

  if (!created.created) {
    return { created: false, operation: created.operation };
  }

  const operationId = created.operation.operationId;
  const rootKeyVersion = input.rootKeyVersion ?? DEFAULT_ROOT_KEY_VERSION;

  try {
    return await executeBackupExport({
      organizationId,
      operationId,
      scheduledAt: input.scheduledAt,
      idempotencyKey,
      rootKeyBytes: input.rootKeyBytes,
      rootKeyVersion,
      storage: input.storage,
      ...(input.instanceId ? { instanceId: input.instanceId } : {}),
    });
  } catch (error) {
    await markBackupExportFailed({
      organizationId,
      operationId,
      idempotencyKey,
      ...(input.onExportFailureAlert ? { onExportFailureAlert: input.onExportFailureAlert } : {}),
    });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("backup export failed", { cause: error });
  }
}
