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

import type { OnBackupExportStepCompleted } from "./backup-export-step.js";
import type { BackupExportStorage } from "./backup-export-storage.js";
import { buildBackupExportIdempotencyKey } from "./build-backup-idempotency-key.js";
import {
  buildInstanceScopeJsonlLines,
  buildOrganizationScopeJsonlLines,
  concatJsonlLines,
} from "./build-backup-jsonl-payload.js";
import { RECOVERY_CANARY_ORGANIZATION_ID } from "./constants.js";
import { enumerateOrganizationIds } from "./enumerate-organization-ids.js";
import {
  BackupExportPointerPublishError,
  publishLatestBackupExport,
  republishLatestBackupExport,
} from "./publish-latest-backup-export.js";
import { resolveExportInstanceId } from "./resolve-export-instance-id.js";
import { sealAndStoreBackupArtifact } from "./seal-and-store-backup-artifact.js";
import type { BackupExportOrganizationSnapshot, BackupExportSuccessEvidence } from "./types.js";

export interface RunBackupExportInput {
  scheduledAt: Date;
  rootKeyBytes: Uint8Array;
  storage: BackupExportStorage;
  organizationId?: OrganizationId;
  instanceId?: string;
  rootKeyVersion?: number;
  onExportFailureAlert?: () => void;
  onStepCompleted?: OnBackupExportStepCompleted;
}

export interface RunBackupExportResult {
  created: boolean;
  operation: OperationMutationResult["operation"];
  exportEvidence?: BackupExportSuccessEvidence;
}

async function buildBackupJsonlPayload(organizationIds: readonly string[]): Promise<{
  jsonlPayload: Uint8Array;
  instanceSnapshotAt: string;
  organizationSnapshots: BackupExportOrganizationSnapshot[];
}> {
  const instanceScope = await buildInstanceScopeJsonlLines();
  const lines = instanceScope.lines;
  const organizationSnapshots: BackupExportOrganizationSnapshot[] = [];

  for (const organizationIdValue of organizationIds) {
    const scoped = await buildOrganizationScopeJsonlLines(
      brandOrganizationId.brand(organizationIdValue),
    );
    lines.push(...scoped.lines);
    organizationSnapshots.push(scoped.snapshot);
  }

  return {
    jsonlPayload: concatJsonlLines(lines),
    instanceSnapshotAt: instanceScope.snapshotAt,
    organizationSnapshots,
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

async function markBackupExportFailed(input: {
  organizationId: OrganizationId;
  operationId?: OperationId;
  idempotencyKey: string;
  onExportFailureAlert?: () => void;
}): Promise<void> {
  // The operator page must fire for every failure, including one thrown before the Operation row
  // exists (e.g. a createOperation FK violation), so it runs first and unconditionally.
  if (input.onExportFailureAlert) {
    input.onExportFailureAlert();
  }
  if (input.operationId === undefined) {
    return;
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
  onStepCompleted?: OnBackupExportStepCompleted;
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
  const { jsonlPayload, instanceSnapshotAt, organizationSnapshots } =
    await buildBackupJsonlPayload(organizationIds);

  const exportEvidence = await sealAndStoreBackupArtifact({
    exportIdentity: input.idempotencyKey,
    instanceId,
    exportTimestamp,
    instanceSnapshotAt,
    rootKeyBytes: input.rootKeyBytes,
    rootKeyVersion: input.rootKeyVersion,
    organizationSnapshots,
    jsonlPayload,
    storage: input.storage,
    operationId: input.operationId,
    ...(input.onStepCompleted ? { onStepCompleted: input.onStepCompleted } : {}),
  });

  const audit = await recordBackupExportAuditEvent({
    organizationId: input.organizationId,
    operationId: input.operationId,
    succeeded: true,
  });
  await input.onStepCompleted?.("audit_recorded");

  const succeeded = await transitionOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
    nextState: "succeeded",
    idempotencyKey: input.idempotencyKey,
    progress: { auditEventIds: [audit.auditEventId] },
  });

  // The Operation is terminal from here. A failure advancing the latest pointer must not route
  // through markBackupExportFailed: that would record a contradictory failure audit event and
  // attempt an illegal succeeded -> failed transition whose terminalState throw would mask the
  // real cause. Replay of the same scheduled run re-publishes the pointer instead.
  try {
    await input.onStepCompleted?.("operation_succeeded");
    await publishLatestBackupExport(input.storage, exportEvidence);
  } catch (error) {
    throw new BackupExportPointerPublishError(error);
  }

  return {
    created: true,
    operation: succeeded.operation,
    exportEvidence,
  };
}

async function handleBackupExportFailure(input: {
  error: unknown;
  organizationId: OrganizationId;
  operationId: OperationId | undefined;
  idempotencyKey: string;
  onExportFailureAlert?: () => void;
}): Promise<never> {
  if (input.error instanceof BackupExportPointerPublishError) {
    // The export itself succeeded and is durable; only the pointer is stale. Page the operator
    // and surface the original cause without recording a contradictory failure.
    input.onExportFailureAlert?.();
    throw input.error;
  }
  await markBackupExportFailed({
    organizationId: input.organizationId,
    ...(input.operationId ? { operationId: input.operationId } : {}),
    idempotencyKey: input.idempotencyKey,
    ...(input.onExportFailureAlert ? { onExportFailureAlert: input.onExportFailureAlert } : {}),
  });
  if (input.error instanceof Error) {
    throw input.error;
  }
  throw new Error("backup export failed", { cause: input.error });
}

export async function runBackupExport(input: RunBackupExportInput): Promise<RunBackupExportResult> {
  const organizationId = input.organizationId ?? RECOVERY_CANARY_ORGANIZATION_ID;
  const idempotencyKey = buildBackupExportIdempotencyKey(input.scheduledAt);
  const rootKeyVersion = input.rootKeyVersion ?? DEFAULT_ROOT_KEY_VERSION;

  // createOperation is inside the try so that any failure creating the Operation — the canary-org
  // FK violation, a lost DB connection, anything — routes to the failure-alert path. A backup
  // pipeline that dies silently before it records an Operation is worse than one that pages.
  let operationId: OperationId | undefined;
  try {
    const created = await createOperation({
      organizationId,
      intentCode: OPERATION_INTENT_CODES.backupExport,
      idempotencyKey,
    });

    if (!created.created) {
      if (created.operation.state === "succeeded") {
        // The prior run may have failed after success but before the latest pointer was confirmed
        // advanced; re-publishing from the durable per-run evidence repairs it idempotently.
        await republishLatestBackupExport(input.storage, idempotencyKey);
      }
      return { created: false, operation: created.operation };
    }

    operationId = created.operation.operationId;

    return await executeBackupExport({
      organizationId,
      operationId,
      scheduledAt: input.scheduledAt,
      idempotencyKey,
      rootKeyBytes: input.rootKeyBytes,
      rootKeyVersion,
      storage: input.storage,
      ...(input.instanceId ? { instanceId: input.instanceId } : {}),
      ...(input.onStepCompleted ? { onStepCompleted: input.onStepCompleted } : {}),
    });
  } catch (error) {
    return await handleBackupExportFailure({
      error,
      organizationId,
      operationId,
      idempotencyKey,
      ...(input.onExportFailureAlert ? { onExportFailureAlert: input.onExportFailureAlert } : {}),
    });
  }
}
