import type { ProjectId } from "@insecur/domain";
import type { OperationProgress } from "./operation-types.js";
import type { FencingToken, SyncProviderKind, SyncTargetKey } from "./sync-target-types.js";

/** Metadata-only lease binding stored on the Operation after claim. */
export interface OperationSyncTargetLeaseProgress {
  readonly projectId: ProjectId;
  readonly providerKind: SyncProviderKind;
  readonly targetIdentity: string;
  readonly fencingToken: FencingToken;
}

export function syncTargetLeaseProgressFromKey(
  target: SyncTargetKey,
  fencingToken: FencingToken,
): OperationSyncTargetLeaseProgress {
  return {
    projectId: target.projectId,
    providerKind: target.providerKind,
    targetIdentity: target.targetIdentity,
    fencingToken,
  };
}

export function syncTargetLeaseContextFromProgress(
  organizationId: SyncTargetKey["organizationId"],
  progress: OperationSyncTargetLeaseProgress,
): {
  target: SyncTargetKey;
  fencingToken: FencingToken;
} {
  return {
    target: {
      organizationId,
      projectId: progress.projectId,
      providerKind: progress.providerKind,
      targetIdentity: progress.targetIdentity,
    },
    fencingToken: progress.fencingToken,
  };
}

export function operationProgressWithoutSyncTargetLease(
  progress: OperationProgress,
): OperationProgress {
  if (progress.syncTargetLease === undefined) {
    return progress;
  }
  const { syncTargetLease, ...rest } = progress;
  void syncTargetLease;
  return rest;
}

export function leaseContextsMatch(
  expected: OperationSyncTargetLeaseProgress,
  provided: { target: SyncTargetKey; fencingToken: FencingToken },
): boolean {
  return (
    provided.target.projectId === expected.projectId &&
    provided.target.providerKind === expected.providerKind &&
    provided.target.targetIdentity === expected.targetIdentity &&
    provided.fencingToken === expected.fencingToken
  );
}
