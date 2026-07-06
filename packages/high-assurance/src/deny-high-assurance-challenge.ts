import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { cancelOperation, getOperation, type OperationPollResult } from "@insecur/operations";
import type { DenyHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { challengeAuditScopeFromBoundEvidence } from "./high-assurance-challenge-audit-scope.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import { isChallengeEvidenceExpired } from "./high-assurance-challenge-helpers.js";
import { optionalHighAssuranceEvidenceScopeFields } from "./optional-high-assurance-evidence-scope-fields.js";
import { recordHighAssuranceChallengeDenied } from "./record-high-assurance-challenge-audit.js";
import { assertClearingAuthorizationForEvidence } from "./validate-high-assurance-evidence-assertions.js";

export type { DenyHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";

function assertDenyAuthorization(
  input: DenyHighAssuranceChallengeInput,
  operation: OperationPollResult,
): void {
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (input.denyingUserAccess === undefined || input.requiredScopes === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      "high-assurance challenge denial requires denying user scopes and effective access",
    );
  }

  assertClearingAuthorizationForEvidence({
    evidence,
    organizationId: input.organizationId,
    requiredScopes: input.requiredScopes,
    clearingUserAccess: input.denyingUserAccess,
  });
}

function assertDenyablePendingChallenge(
  operation: OperationPollResult,
  input: DenyHighAssuranceChallengeInput,
): NonNullable<OperationPollResult["progress"]["highAssuranceChallenge"]> {
  if (operation.state !== "waiting_for_human") {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      `operation must be waiting_for_human to deny challenge, was ${operation.state}`,
    );
  }

  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (evidence.clearedAt !== undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      "high-assurance challenge evidence is already cleared",
    );
  }

  if (isChallengeEvidenceExpired(evidence.expiresAt, new Date())) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceExpired,
      "high-assurance challenge evidence expired",
    );
  }

  assertDenyAuthorization(input, operation);
  return evidence;
}

export async function denyHighAssuranceChallenge(
  input: DenyHighAssuranceChallengeInput,
): Promise<OperationPollResult> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });
  const evidence = assertDenyablePendingChallenge(operation, input);

  const mutation = await cancelOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  await recordHighAssuranceChallengeDenied({
    ...challengeAuditScopeFromBoundEvidence(input, evidence),
    denyingUserId: input.denyingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    ...optionalHighAssuranceEvidenceScopeFields(evidence),
  });

  return mutation.operation;
}

export const DENY_HIGH_ASSURANCE_CHALLENGE_REQUIRED_SCOPES = [
  AUTHORIZATION_SCOPES.approvalReject,
] as const;
