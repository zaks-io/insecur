export { DEFAULT_HIGH_ASSURANCE_CHALLENGE_TTL_SECONDS } from "./constants.js";
export {
  HIGH_ASSURANCE_AUTHENTICATION_METHOD_CODES,
  HIGH_ASSURANCE_RISK_REASON_CODES,
  isHighAssuranceRiskReasonCode,
  type HighAssuranceAuthenticationMethodCode,
  type HighAssuranceRiskReasonCode,
} from "./high-assurance-risk-reason-codes.js";
export {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
export { HighAssuranceHandoffError } from "./high-assurance-handoff-error.js";
export type {
  HighAssuranceChallengeLifecycleState,
  HighAssuranceChallengeStatus,
} from "./high-assurance-challenge-types.js";
export type { HighAssuranceChallengeReviewItem } from "@insecur/operations";
export {
  computeChallengeExpiresAt,
  generateChallengeId,
  isChallengeEvidenceExpired,
  mapSessionAssuranceToAuthenticationMethodCode,
} from "./high-assurance-challenge-helpers.js";
export {
  assertClearingActorForPendingChallenge,
  mapSessionAssuranceFailureToReasonCode,
  resolveHighAssuranceChallengeStatus,
  validateHighAssuranceEvidence,
  type ValidateHighAssuranceEvidenceInput,
} from "./validate-high-assurance-evidence.js";
export {
  requestHighAssuranceChallenge,
  type RequestHighAssuranceChallengeInput,
} from "./request-high-assurance-challenge.js";
export {
  clearHighAssuranceChallenge,
  type ClearHighAssuranceChallengeInput,
} from "./clear-high-assurance-challenge.js";
export {
  consumeHighAssuranceEvidence,
  type ConsumeHighAssuranceEvidenceInput,
} from "./consume-high-assurance-evidence.js";
export {
  getHighAssuranceChallengeStatus,
  type GetHighAssuranceChallengeStatusInput,
} from "./get-high-assurance-challenge-status.js";
export {
  listPendingHighAssuranceChallenges,
  type ListPendingHighAssuranceChallengesInput,
} from "./list-pending-high-assurance-challenges.js";
export {
  denyHighAssuranceChallenge,
  DENY_HIGH_ASSURANCE_CHALLENGE_REQUIRED_SCOPES,
  type DenyHighAssuranceChallengeInput,
} from "./deny-high-assurance-challenge.js";
export { toHighAssuranceChallengeReviewItem } from "./to-high-assurance-challenge-review-item.js";
export {
  recordHighAssuranceChallengeCleared,
  recordHighAssuranceChallengeClearDenied,
  recordHighAssuranceChallengeDenied,
  recordHighAssuranceChallengeRequestDenied,
  recordHighAssuranceChallengeRequested,
  recordHighAssuranceEvidenceConsumeDenied,
  recordHighAssuranceEvidenceConsumed,
} from "./record-high-assurance-challenge-audit.js";
export {
  consumeEvidenceOrThrowHandoff,
  requestProtectedEnvironmentMutationHandoff,
} from "./protected-environment-mutation-handoff.js";
export {
  protectedEnvironmentMutationGateInput,
  runProtectedEnvironmentMutationGate,
  type ProtectedEnvironmentMutationGateScope,
} from "./run-protected-environment-mutation-gate.js";
