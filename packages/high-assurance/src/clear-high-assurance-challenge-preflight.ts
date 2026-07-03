import { evaluateSessionAssurance } from "@insecur/auth";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import type { HighAssuranceAuthenticationMethodCode } from "./high-assurance-risk-reason-codes.js";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { denyClearHighAssuranceChallenge } from "./clear-high-assurance-challenge-denial.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import { mapSessionAssuranceToAuthenticationMethodCode } from "./high-assurance-challenge-helpers.js";
import {
  assertClearingActorForPendingChallenge,
  mapSessionAssuranceFailureToReasonCode,
} from "./validate-high-assurance-evidence.js";

function denyOptions(riskReasonCode?: string) {
  return riskReasonCode !== undefined ? { riskReasonCode } : {};
}

export async function requireSessionAssuranceForClear(
  input: ClearHighAssuranceChallengeInput,
  riskReasonCode?: string,
): Promise<HighAssuranceAuthenticationMethodCode> {
  const assurance = evaluateSessionAssurance(input.sessionAssurance);
  if (!assurance.ok) {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed,
      `session assurance failed: ${assurance.reason}`,
      {
        auditReasonCode: mapSessionAssuranceFailureToReasonCode(assurance.reason),
        ...denyOptions(riskReasonCode),
      },
    );
  }

  const authenticationMethodCode = mapSessionAssuranceToAuthenticationMethodCode(
    input.sessionAssurance,
  );
  if (authenticationMethodCode === null) {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed,
      "fresh high-assurance authentication method is required to clear challenge",
      denyOptions(riskReasonCode),
    );
  }

  return authenticationMethodCode;
}

export async function requireOperationWaitingForClear(
  operation: OperationPollResult,
  input: ClearHighAssuranceChallengeInput,
  riskReasonCode?: string,
): Promise<void> {
  if (operation.state !== "waiting_for_human") {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      `operation must be waiting_for_human to clear challenge, was ${operation.state}`,
      denyOptions(riskReasonCode),
    );
  }
}

export async function requirePendingChallengeEvidence(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
  input: ClearHighAssuranceChallengeInput,
): Promise<OperationHighAssuranceChallengeEvidence> {
  if (evidence === undefined) {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (evidence.clearedAt !== undefined) {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      "high-assurance challenge evidence is already cleared",
      denyOptions(evidence.riskReasonCode),
    );
  }

  if (
    evidence.requestingUserId !== undefined &&
    evidence.requestingUserId !== input.clearingUserId
  ) {
    return await denyClearHighAssuranceChallenge(
      input,
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "human-session bounded operation must be cleared by the requesting user",
      denyOptions(evidence.riskReasonCode),
    );
  }

  return evidence;
}

export async function assertClearingActorForClear(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
): Promise<void> {
  if (input.requiredScopes === undefined || input.clearingUserAccess === undefined) {
    return;
  }

  try {
    assertClearingActorForPendingChallenge({
      evidence,
      clearingUserId: input.clearingUserId,
      requiredScopes: input.requiredScopes,
      clearingUserAccess: input.clearingUserAccess,
    });
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      return await denyClearHighAssuranceChallenge(input, error.code, error.message, {
        riskReasonCode: evidence.riskReasonCode,
      });
    }
    throw error;
  }
}
