import type { StorageGateEvidenceRef, StorageGateProbeOutcome } from "./types.js";
import type { StorageSecurityGateControlId } from "./control-ids.js";

export type ComposableReadinessStatus = "ready" | "not_ready" | "unknown";

export interface MapReadinessReportToProbeOutcomeInput {
  readonly controlId: StorageSecurityGateControlId;
  readonly status: ComposableReadinessStatus;
  readonly passedSummary: string;
  readonly blockedSummary: string;
  readonly unknownSummary?: string;
  readonly blockingReason?: string;
  readonly evidence?: readonly StorageGateEvidenceRef[];
}

function probeOutcomeWithEvidence<T extends StorageGateProbeOutcome>(
  outcome: T,
  evidence?: readonly StorageGateEvidenceRef[],
): T {
  return evidence ? { ...outcome, evidence } : outcome;
}

/** Maps a deeper-module readiness report into a gate probe outcome (metadata-only). */
export function mapReadinessReportToProbeOutcome(
  input: MapReadinessReportToProbeOutcomeInput,
): StorageGateProbeOutcome {
  if (input.status === "ready") {
    return probeOutcomeWithEvidence(
      {
        status: "passed",
        summary: input.passedSummary,
      },
      input.evidence,
    );
  }

  if (input.status === "unknown") {
    return probeOutcomeWithEvidence(
      {
        status: "unknown",
        summary: input.unknownSummary ?? `Readiness probe for ${input.controlId} is unreachable.`,
        blocking_reason: input.blockingReason ?? "probe_unreachable",
      },
      input.evidence,
    );
  }

  return probeOutcomeWithEvidence(
    {
      status: "blocked",
      summary: input.blockedSummary,
      blocking_reason: input.blockingReason ?? "readiness_not_ready",
    },
    input.evidence,
  );
}

export function mapCanaryEvidenceToNoPlaintextProbeOutcome(input: {
  readonly testRunId: string | null;
  readonly passed: boolean;
}): StorageGateProbeOutcome {
  if (!input.testRunId) {
    return {
      status: "unknown",
      summary: "No-plaintext canary evidence is missing.",
      blocking_reason: "missing_canary_evidence",
    };
  }

  if (!input.passed) {
    return {
      status: "blocked",
      summary: "Latest no-plaintext canary run did not pass.",
      blocking_reason: "canary_failed",
      evidence: [{ kind: "test_run_id", id: input.testRunId }],
    };
  }

  return {
    status: "passed",
    summary: "No-plaintext canary evidence is current.",
    evidence: [{ kind: "test_run_id", id: input.testRunId }],
  };
}
