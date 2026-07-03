import type { AuthorizationScope } from "@insecur/access";
import type { EffectiveAccessResult } from "@insecur/access";
import { AUTH_ERROR_CODES, type UserId } from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import {
  assertClearingUserScopes,
  requireChallengeEvidence,
  requireClearedEvidence,
  requireClearingUserMatch,
  requireUnconsumedEvidence,
  requireUnexpiredEvidence,
} from "./validate-high-assurance-evidence-assertions.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";

export interface ValidateHighAssuranceEvidenceInput {
  readonly operation: OperationPollResult;
  readonly clearingUserId?: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
  readonly now?: Date;
}

export interface ValidateHighAssuranceEvidenceResult {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
}

export function validateHighAssuranceEvidence(
  input: ValidateHighAssuranceEvidenceInput,
): ValidateHighAssuranceEvidenceResult {
  const evidence = requireChallengeEvidence(input.operation.progress.highAssuranceChallenge);
  requireUnconsumedEvidence(evidence);
  requireUnexpiredEvidence(evidence, input.now ?? new Date());
  requireClearedEvidence(evidence);
  requireClearingUserMatch(evidence, input.clearingUserId);

  if (input.requiredScopes !== undefined && input.clearingUserAccess !== undefined) {
    assertClearingUserScopes(input.requiredScopes, input.clearingUserAccess);
  }

  return { evidence };
}

export function assertClearingActorForPendingChallenge(input: {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly clearingUserId: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
}): void {
  if (
    input.evidence.requestingUserId !== undefined &&
    input.evidence.requestingUserId !== input.clearingUserId
  ) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "human-session bounded operation must be cleared by the requesting user",
    );
  }

  if (input.requiredScopes !== undefined && input.clearingUserAccess !== undefined) {
    assertClearingUserScopes(input.requiredScopes, input.clearingUserAccess);
  }
}

export function mapSessionAssuranceFailureToReasonCode(
  reason: "sms_not_allowed" | "mfa_enrollment" | "insufficient_assurance",
): typeof AUTH_ERROR_CODES.mfaEnrollmentRequired | typeof AUTH_ERROR_CODES.reauthRequired {
  return reason === "mfa_enrollment"
    ? AUTH_ERROR_CODES.mfaEnrollmentRequired
    : AUTH_ERROR_CODES.reauthRequired;
}

export { resolveHighAssuranceChallengeStatus } from "./resolve-high-assurance-challenge-status.js";
