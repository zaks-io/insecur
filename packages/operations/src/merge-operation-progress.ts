import type { AuditEventId } from "@insecur/domain";
import type { OperationProgress, OperationProgressPatch } from "./operation-types.js";

function mergeAuditEventIds(
  existing: readonly AuditEventId[] | undefined,
  incoming: readonly AuditEventId[] | undefined,
): readonly AuditEventId[] | undefined {
  if (incoming === undefined) {
    return existing;
  }
  const merged = new Set<AuditEventId>(existing ?? []);
  for (const id of incoming) {
    merged.add(id);
  }
  return [...merged];
}

function mergeCounters(
  existing: Readonly<Record<string, number>> | undefined,
  incoming: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> | undefined {
  if (incoming === undefined) {
    return existing;
  }
  return { ...existing, ...incoming };
}

export function mergeOperationProgress(
  existing: OperationProgress,
  patch: OperationProgressPatch,
): OperationProgress {
  const { syncTargetLease, ...patchRest } = patch;
  const auditEventIds = mergeAuditEventIds(existing.auditEventIds, patchRest.auditEventIds);
  const counters = mergeCounters(existing.counters, patchRest.counters);

  const merged: OperationProgress = {
    ...existing,
    ...patchRest,
    ...(auditEventIds !== undefined ? { auditEventIds } : {}),
    ...(counters !== undefined ? { counters } : {}),
    ...(patchRest.wait !== undefined
      ? { wait: patchRest.wait }
      : existing.wait !== undefined
        ? { wait: existing.wait }
        : {}),
    ...(patchRest.retry !== undefined
      ? { retry: patchRest.retry }
      : existing.retry !== undefined
        ? { retry: existing.retry }
        : {}),
    ...(existing.syncTargetLease !== undefined
      ? { syncTargetLease: existing.syncTargetLease }
      : {}),
  };

  return applySyncTargetLeasePatch(merged, syncTargetLease);
}

function applySyncTargetLeasePatch(
  merged: OperationProgress,
  syncTargetLease: OperationProgressPatch["syncTargetLease"],
): OperationProgress {
  if (syncTargetLease === null) {
    const { syncTargetLease: binding, ...withoutLease } = merged;
    void binding;
    return withoutLease;
  }
  if (syncTargetLease !== undefined) {
    return { ...merged, syncTargetLease };
  }
  return merged;
}
