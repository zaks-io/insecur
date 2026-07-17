import type { UserActorRef } from "@insecur/access";
import {
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  isStableDottedCode,
  readErrorCode,
  type KnownErrorCode,
  type OperationId,
} from "@insecur/domain";
import {
  releaseSyncTargetLease,
  transitionOperation,
  type OperationState,
  type SyncTargetKey,
  type SyncTargetLeaseContext,
} from "@insecur/operations";
import type { AppConnectionRow, SecretSyncBindingRow, SecretSyncRow } from "@insecur/tenant-store";

import { PROVIDER_WRITE_STATUSES, type ProviderWriteStatus } from "./provider-sync-write-port.js";
import type { SecretSyncAuditScope } from "./record-secret-sync-audit.js";
import {
  recordSecretSyncRunDenied,
  toRunBindingAuditDetails,
} from "./record-secret-sync-run-audit.js";
import { SecretSyncError } from "./secret-sync-error.js";
import type {
  RunSecretSyncCommandInput,
  RunSecretSyncCommandResult,
} from "./run-secret-sync-command.js";

/** Shared state for one Inline Sync Execution request (internal seam). */
export interface SecretSyncRunSession {
  readonly input: RunSecretSyncCommandInput;
  readonly auditScope: SecretSyncAuditScope & { readonly actorUserId: UserActorRef["userId"] };
  readonly sync: SecretSyncRow;
  readonly connection: AppConnectionRow;
  readonly bindings: readonly SecretSyncBindingRow[];
  readonly target: SyncTargetKey;
  readonly operationId: OperationId;
}

/** Metadata-only per-binding write record for audit details. */
export interface BindingWriteRecord {
  readonly bindingId: string;
  readonly secretId: string;
  readonly writeStatus: string;
}

export interface RunCounters {
  readonly totalBindings: number;
  readonly writtenCount: number;
  readonly failedCount: number;
  readonly verifiedCount: number;
}

export const PROVIDER_CODE_BY_WRITE_STATUS: Record<ProviderWriteStatus, KnownErrorCode> = {
  [PROVIDER_WRITE_STATUSES.written]: PROVIDER_ERROR_CODES.unavailable,
  [PROVIDER_WRITE_STATUSES.permissionDenied]: PROVIDER_ERROR_CODES.permissionDenied,
  [PROVIDER_WRITE_STATUSES.targetMissing]: PROVIDER_ERROR_CODES.lookupNotFound,
  [PROVIDER_WRITE_STATUSES.retryableUnavailable]: PROVIDER_ERROR_CODES.unavailable,
};

export function toRunReasonCode(error: unknown, fallback: KnownErrorCode): KnownErrorCode {
  const code = readErrorCode(error);
  return code !== undefined && isStableDottedCode(code) ? code : fallback;
}

export function emptyCounters(totalBindings: number): RunCounters {
  return { totalBindings, writtenCount: 0, failedCount: 0, verifiedCount: 0 };
}

/**
 * Resolves the opaque Sync Target Serialization identity. GitHub serializes
 * on the pinned provider repo id. Cloudflare serializes on the App
 * Connection id: the Worker script name is Sensitive Metadata and may never
 * appear in lease keys, and the connection pins one account plus allowed
 * script boundary (ADR-0039), so per-connection serialization conservatively
 * covers per-script serialization for the one-deploy-per-run write path.
 */
function syncTargetIdentity(sync: SecretSyncRow): string | null {
  return sync.kind === SECRET_SYNC_KINDS.githubActions ? sync.targetRepoId : sync.appConnectionId;
}

export function syncTargetKey(
  sync: SecretSyncRow,
  providerKindGuard: (value: string) => boolean,
): SyncTargetKey {
  if (!providerKindGuard(sync.kind)) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "secret sync kind is not a supported sync provider",
    );
  }
  const targetIdentity = syncTargetIdentity(sync);
  if (targetIdentity === null || targetIdentity.length === 0) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "secret sync target identity is not configured",
    );
  }
  return {
    organizationId: sync.organizationId,
    projectId: sync.projectId,
    providerKind: sync.kind,
    targetIdentity,
  };
}

export async function auditRunDenied(
  session: SecretSyncRunSession,
  reasonCode: KnownErrorCode,
  records?: readonly BindingWriteRecord[],
  counters?: RunCounters,
): Promise<string> {
  const audit = await recordSecretSyncRunDenied({
    ...session.auditScope,
    secretSyncId: session.input.secretSyncId,
    operationId: session.operationId,
    reasonCode,
    ...(records !== undefined && counters !== undefined
      ? { details: toRunBindingAuditDetails(records, { ...counters }, session.sync.kind) }
      : {}),
  });
  return audit.auditEventId;
}

export function runResult(
  session: SecretSyncRunSession,
  state: OperationState,
  counters: RunCounters,
  extras: { readonly resultCode?: KnownErrorCode; readonly auditEventId?: string } = {},
): RunSecretSyncCommandResult {
  return {
    operationId: session.operationId,
    state,
    startedExecution: true,
    ...counters,
    ...(extras.resultCode !== undefined ? { resultCode: extras.resultCode } : {}),
    ...(extras.auditEventId !== undefined ? { auditEventId: extras.auditEventId } : {}),
  };
}

/**
 * Parks the Operation `blocked` after a deterministic pre-write failure: no
 * live provider effect happened, the lease (if held) is released, and the
 * denial is auditable with a stable reason code.
 */
export async function parkBlocked(
  session: SecretSyncRunSession,
  reasonCode: KnownErrorCode,
  lease?: SyncTargetLeaseContext,
): Promise<RunSecretSyncCommandResult> {
  await transitionOperation({
    organizationId: session.input.organizationId,
    operationId: session.operationId,
    nextState: "blocked",
    progress: { resultCode: reasonCode },
    ...(lease !== undefined ? { lease } : {}),
  });
  if (lease !== undefined) {
    await releaseSyncTargetLease({
      target: session.target,
      operationId: session.operationId,
      fencingToken: lease.fencingToken,
    });
  }
  const auditEventId = await auditRunDenied(session, reasonCode);
  return runResult(session, "blocked", emptyCounters(session.bindings.length), {
    resultCode: reasonCode,
    auditEventId,
  });
}
