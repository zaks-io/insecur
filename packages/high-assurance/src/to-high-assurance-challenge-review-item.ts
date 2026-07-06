import type { HighAssuranceChallengeReviewItem, OperationPollResult } from "@insecur/operations";
import { optionalHighAssuranceEvidenceScopeFields } from "./optional-high-assurance-evidence-scope-fields.js";
import { resolveHighAssuranceChallengeStatus } from "./resolve-high-assurance-challenge-status.js";

export function toHighAssuranceChallengeReviewItem(
  operation: OperationPollResult,
  options?: { readonly now?: string },
): HighAssuranceChallengeReviewItem | null {
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    return null;
  }

  const status = resolveHighAssuranceChallengeStatus({
    operationId: operation.operationId,
    highAssuranceChallenge: evidence,
    ...(options?.now !== undefined ? { now: options.now } : {}),
  });

  return {
    operationId: operation.operationId,
    intentCode: operation.intentCode,
    challengeId: evidence.challengeId,
    projectId: evidence.projectId,
    riskReasonCode: evidence.riskReasonCode,
    requestedAt: evidence.requestedAt,
    expiresAt: evidence.expiresAt,
    status: status.state,
    hasClearedEvidence: status.hasClearedEvidence,
    ...optionalHighAssuranceEvidenceScopeFields(evidence),
  };
}
