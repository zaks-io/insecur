import type { AuthorizationScope } from "@insecur/access";
import { hasAuthorizationScope, type EffectiveAccessResult } from "@insecur/access";
import type { EnvironmentId, OrganizationId, ProjectId, UserId } from "@insecur/domain";
import type { MachineIdentityId } from "@insecur/domain";
import type { OperationHighAssuranceChallengeEvidence } from "@insecur/operations";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import { isChallengeEvidenceExpired } from "./high-assurance-challenge-helpers.js";

export function requireChallengeEvidence(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
): OperationHighAssuranceChallengeEvidence {
  if (evidence === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is required",
    );
  }
  return evidence;
}

export function requireUnconsumedEvidence(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (evidence.consumedAt !== undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      "high-assurance challenge evidence was already consumed",
    );
  }
}

export function requireUnexpiredEvidence(
  evidence: OperationHighAssuranceChallengeEvidence,
  now: Date,
): void {
  if (isChallengeEvidenceExpired(evidence.expiresAt, now)) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceExpired,
      "high-assurance challenge evidence expired",
    );
  }
}

export function requireClearedEvidence(evidence: OperationHighAssuranceChallengeEvidence): void {
  if (evidence.clearedAt === undefined || evidence.clearingUserId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is not cleared",
    );
  }
}

export function requireClearingUserMatch(
  evidence: OperationHighAssuranceChallengeEvidence,
  clearingUserId: UserId | undefined,
): void {
  if (clearingUserId !== undefined && evidence.clearingUserId !== clearingUserId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "high-assurance challenge evidence clearing user does not match",
    );
  }
}

export function requireResumingActorForConsume(input: {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly resumingUserId?: UserId;
  readonly resumingMachineIdentityId?: MachineIdentityId;
}): void {
  if (input.resumingUserId === undefined && input.resumingMachineIdentityId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      "high-assurance evidence consume requires a resuming user or machine identity",
    );
  }

  if (
    input.evidence.requestingUserId !== undefined &&
    input.resumingUserId !== input.evidence.requestingUserId
  ) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "resuming user does not match bound challenge evidence",
    );
  }

  if (
    input.evidence.requestingMachineIdentityId !== undefined &&
    input.resumingMachineIdentityId !== input.evidence.requestingMachineIdentityId
  ) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "resuming machine identity does not match bound challenge evidence",
    );
  }
}

export function requireConsumeCoordinateMatch(input: {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
}): void {
  if (input.projectId !== input.evidence.projectId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller project does not match bound challenge evidence",
    );
  }

  if (input.environmentId !== input.evidence.environmentId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller environment does not match bound challenge evidence",
    );
  }
}

function assertClearingUserScopes(
  requiredScopes: readonly AuthorizationScope[],
  clearingUserAccess: EffectiveAccessResult,
): void {
  for (const scope of requiredScopes) {
    if (!hasAuthorizationScope(clearingUserAccess, scope)) {
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
        `clearing user lacks required scope ${scope}`,
      );
    }
  }
}

function isMachineOriginChallengeEvidence(
  evidence: OperationHighAssuranceChallengeEvidence,
): boolean {
  return evidence.requestingMachineIdentityId !== undefined;
}

function assertClearingUserAccessOrganization(
  organizationId: OrganizationId,
  clearingUserAccess: EffectiveAccessResult,
): void {
  if (clearingUserAccess.organizationId !== organizationId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "clearing user effective access organization does not match bounded operation",
    );
  }
}

export function assertClearingAuthorizationForEvidence(input: {
  readonly evidence: OperationHighAssuranceChallengeEvidence;
  readonly organizationId: OrganizationId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
}): void {
  const hasAccessInput =
    input.requiredScopes !== undefined && input.clearingUserAccess !== undefined;

  if (isMachineOriginChallengeEvidence(input.evidence)) {
    if (!hasAccessInput) {
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
        "machine-origin bounded operation requires clearing user scopes and effective access",
      );
    }

    assertClearingUserAccessOrganization(input.organizationId, input.clearingUserAccess);
    assertClearingUserScopes(input.requiredScopes, input.clearingUserAccess);
    return;
  }

  if (hasAccessInput) {
    assertClearingUserAccessOrganization(input.organizationId, input.clearingUserAccess);
    assertClearingUserScopes(input.requiredScopes, input.clearingUserAccess);
  }
}
