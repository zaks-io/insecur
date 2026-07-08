import type { StorageSecurityGateControlId } from "./control-ids.js";
import type { StorageGateControl, StorageGateProbeOutcome } from "./types.js";

export function evaluateStorageGateControl(
  controlId: StorageSecurityGateControlId,
  outcome: StorageGateProbeOutcome,
  checkedAt: string,
): StorageGateControl {
  const evidence = outcome.evidence ?? [];

  if (outcome.status === "passed") {
    return {
      id: controlId,
      status: "passed",
      summary: outcome.summary,
      evidence,
      checked_at: checkedAt,
    };
  }

  if (outcome.status === "blocked") {
    return {
      id: controlId,
      status: "blocked",
      summary: outcome.summary,
      evidence,
      checked_at: checkedAt,
      blocking_reason: outcome.blocking_reason,
    };
  }

  return {
    id: controlId,
    status: "unknown",
    summary: outcome.summary,
    evidence,
    checked_at: checkedAt,
    ...(outcome.blocking_reason ? { blocking_reason: outcome.blocking_reason } : {}),
  };
}

export function missingEvidenceProbeOutcome(
  controlId: StorageSecurityGateControlId,
): StorageGateProbeOutcome {
  return {
    status: "unknown",
    summary: `Readiness evidence for ${controlId} is missing.`,
    blocking_reason: "missing_readiness_evidence",
  };
}

export function probeThrewProbeOutcome(
  controlId: StorageSecurityGateControlId,
): StorageGateProbeOutcome {
  return {
    status: "unknown",
    summary: `Readiness probe for ${controlId} threw.`,
    blocking_reason: "probe_threw",
  };
}
