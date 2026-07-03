import type { AuthorizationScope } from "@insecur/access";
import type { EffectiveAccessResult } from "@insecur/access";
import { AUTH_ERROR_CODES, type OrganizationId, type UserId } from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import {
  assertClearingAuthorizationForEvidence,
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

export interface ValidateConsumeActorInput {
  readonly organizationId: OrganizationId;
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly clearingUserId?: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
}

export function buildValidateConsumeActorInput(input: {
  readonly organizationId: OrganizationId;
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly clearingUserId?: UserId | undefined;
  readonly requiredScopes?: readonly AuthorizationScope[] | undefined;
  readonly clearingUserAccess?: EffectiveAccessResult | undefined;
}): ValidateConsumeActorInput {
  return {
    organizationId: input.organizationId,
    evidence: input.evidence,
    ...(input.clearingUserId !== undefined ? { clearingUserId: input.clearingUserId } : {}),
    ...(input.requiredScopes !== undefined ? { requiredScopes: input.requiredScopes } : {}),
    ...(input.clearingUserAccess !== undefined
      ? { clearingUserAccess: input.clearingUserAccess }
      : {}),
  };
}

export function validateConsumeActor(input: ValidateConsumeActorInput): void {
  requireClearedEvidence(input.evidence);
  requireClearingUserMatch(input.evidence, input.clearingUserId);
  assertClearingAuthorizationForEvidence(input);
}

export function validateHighAssuranceEvidence(
  input: ValidateHighAssuranceEvidenceInput,
): ValidateHighAssuranceEvidenceResult {
  const evidence = requireChallengeEvidence(input.operation.progress.highAssuranceChallenge);
  requireUnconsumedEvidence(evidence);
  requireUnexpiredEvidence(evidence, input.now ?? new Date());
  validateConsumeActor(
    buildValidateConsumeActorInput({
      organizationId: input.operation.organizationId,
      evidence,
      clearingUserId: input.clearingUserId,
      requiredScopes: input.requiredScopes,
      clearingUserAccess: input.clearingUserAccess,
    }),
  );

  return { evidence };
}

export function assertClearingActorForPendingChallenge(input: {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly organizationId: OrganizationId;
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

  assertClearingAuthorizationForEvidence(input);
}

export function mapSessionAssuranceFailureToReasonCode(
  reason: "sms_not_allowed" | "mfa_enrollment" | "insufficient_assurance",
): typeof AUTH_ERROR_CODES.mfaEnrollmentRequired | typeof AUTH_ERROR_CODES.reauthRequired {
  return reason === "mfa_enrollment"
    ? AUTH_ERROR_CODES.mfaEnrollmentRequired
    : AUTH_ERROR_CODES.reauthRequired;
}

export { resolveHighAssuranceChallengeStatus } from "./resolve-high-assurance-challenge-status.js";
