import type { AuditEventId } from "@insecur/domain";
import type { OperationProgress } from "./operation-types.js";

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
  patch: OperationProgress,
): OperationProgress {
  const auditEventIds = mergeAuditEventIds(existing.auditEventIds, patch.auditEventIds);
  const counters = mergeCounters(existing.counters, patch.counters);

  const merged: OperationProgress = {
    ...existing,
    ...patch,
    ...(auditEventIds !== undefined ? { auditEventIds } : {}),
    ...(counters !== undefined ? { counters } : {}),
    ...(patch.wait !== undefined
      ? { wait: patch.wait }
      : existing.wait !== undefined
        ? { wait: existing.wait }
        : {}),
    ...(patch.retry !== undefined
      ? { retry: patch.retry }
      : existing.retry !== undefined
        ? { retry: existing.retry }
        : {}),
  };

  return merged;
}
