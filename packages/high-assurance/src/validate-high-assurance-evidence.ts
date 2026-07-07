import type { AuthorizationScope } from "@insecur/access";
import type { EffectiveAccessResult } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type MachineIdentityId,
  type OrganizationId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import {
  assertClearingAuthorizationForEvidence,
  requireChallengeEvidence,
  requireClearedEvidence,
  requireClearingUserMatch,
  requireConsumeCoordinateMatch,
  requireResumingActorForConsume,
  requireUnconsumedEvidence,
  requireUnexpiredEvidence,
} from "./validate-high-assurance-evidence-assertions.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";

import type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";

function optionalConsumeActorBindingFields(input: {
  readonly environmentId?: EnvironmentId | undefined;
  readonly resumingUserId?: UserId | undefined;
  readonly resumingMachineIdentityId?: MachineIdentityId | undefined;
  readonly clearingUserId?: UserId | undefined;
  readonly requiredScopes?: readonly AuthorizationScope[] | undefined;
  readonly clearingUserAccess?: EffectiveAccessResult | undefined;
}) {
  return {
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.resumingUserId !== undefined ? { resumingUserId: input.resumingUserId } : {}),
    ...(input.resumingMachineIdentityId !== undefined
      ? { resumingMachineIdentityId: input.resumingMachineIdentityId }
      : {}),
    ...(input.clearingUserId !== undefined ? { clearingUserId: input.clearingUserId } : {}),
    ...(input.requiredScopes !== undefined ? { requiredScopes: input.requiredScopes } : {}),
    ...(input.clearingUserAccess !== undefined
      ? { clearingUserAccess: input.clearingUserAccess }
      : {}),
  };
}

export interface ValidateHighAssuranceEvidenceInput {
  readonly operation: OperationPollResult;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly resumingUserId?: UserId;
  readonly resumingMachineIdentityId?: MachineIdentityId;
  readonly clearingUserId?: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
  readonly now?: Date;
}

export function buildValidateHighAssuranceEvidenceInput(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
): ValidateHighAssuranceEvidenceInput {
  return {
    operation,
    projectId: input.projectId,
    clearingUserId: input.clearingUserId,
    ...optionalConsumeActorBindingFields(input),
  };
}

export interface ValidateHighAssuranceEvidenceResult {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
}

export interface ValidateConsumeActorInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly resumingUserId?: UserId;
  readonly resumingMachineIdentityId?: MachineIdentityId;
  readonly clearingUserId?: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
}

export function buildValidateConsumeActorInput(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId | undefined;
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly resumingUserId?: UserId | undefined;
  readonly resumingMachineIdentityId?: MachineIdentityId | undefined;
  readonly clearingUserId?: UserId | undefined;
  readonly requiredScopes?: readonly AuthorizationScope[] | undefined;
  readonly clearingUserAccess?: EffectiveAccessResult | undefined;
}): ValidateConsumeActorInput {
  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    evidence: input.evidence,
    ...optionalConsumeActorBindingFields(input),
  };
}

export function validateConsumeActor(input: ValidateConsumeActorInput): void {
  requireClearedEvidence(input.evidence);
  requireConsumeCoordinateMatch(input);
  requireResumingActorForConsume(input);
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
      projectId: input.projectId,
      evidence,
      ...optionalConsumeActorBindingFields(input),
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
  reason:
    "sms_not_allowed" | "mfa_enrollment" | "insufficient_assurance" | "fresh_step_up_required",
): typeof AUTH_ERROR_CODES.mfaEnrollmentRequired | typeof AUTH_ERROR_CODES.reauthRequired {
  return reason === "mfa_enrollment"
    ? AUTH_ERROR_CODES.mfaEnrollmentRequired
    : AUTH_ERROR_CODES.reauthRequired;
}

export { resolveHighAssuranceChallengeStatus } from "./resolve-high-assurance-challenge-status.js";
