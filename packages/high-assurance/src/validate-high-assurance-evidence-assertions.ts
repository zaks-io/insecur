import type { AuthorizationScope } from "@insecur/access";
import { hasAuthorizationScope, type EffectiveAccessResult } from "@insecur/access";
import type { UserId } from "@insecur/domain";
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

  if (evidence.requestingUserId !== undefined && clearingUserId !== undefined) {
    if (evidence.requestingUserId !== clearingUserId) {
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
        "human-session bounded operation must be cleared by the requesting user",
      );
    }
  }
}

export function assertClearingUserScopes(
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
