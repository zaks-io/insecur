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
import {
  isChallengeEvidenceExpired,
  mapSessionAssuranceToAuthenticationMethodCode,
} from "./high-assurance-challenge-helpers.js";
import {
  assertClearingActorForPendingChallenge,
  mapSessionAssuranceFailureToReasonCode,
} from "./validate-high-assurance-evidence.js";

function deny(
  clearInput: ClearHighAssuranceChallengeInput,
  throwCode: (typeof HIGH_ASSURANCE_ERROR_CODES)[keyof typeof HIGH_ASSURANCE_ERROR_CODES],
  message: string,
  options?: {
    readonly boundEvidence?: OperationHighAssuranceChallengeEvidence;
    readonly auditReasonCode?: Parameters<
      typeof denyClearHighAssuranceChallenge
    >[0]["auditReasonCode"];
    readonly riskReasonCode?: string;
  },
): Promise<never> {
  return denyClearHighAssuranceChallenge({
    clearInput,
    throwCode,
    message,
    ...(options?.boundEvidence !== undefined ? { boundEvidence: options.boundEvidence } : {}),
    ...(options?.auditReasonCode !== undefined ? { auditReasonCode: options.auditReasonCode } : {}),
    ...(options?.riskReasonCode !== undefined ? { riskReasonCode: options.riskReasonCode } : {}),
  });
}

function boundEvidenceOptions(evidence: OperationHighAssuranceChallengeEvidence): {
  boundEvidence: OperationHighAssuranceChallengeEvidence;
  riskReasonCode: string;
} {
  return {
    boundEvidence: evidence,
    riskReasonCode: evidence.riskReasonCode,
  };
}

async function assertBoundProjectMatch(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
): Promise<void> {
  if (input.projectId !== evidence.projectId) {
    await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller project does not match bound challenge evidence",
      boundEvidenceOptions(evidence),
    );
  }
}

async function assertHumanSessionClearingActor(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
): Promise<void> {
  if (
    evidence.requestingUserId !== undefined &&
    evidence.requestingUserId !== input.clearingUserId
  ) {
    await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "human-session bounded operation must be cleared by the requesting user",
      boundEvidenceOptions(evidence),
    );
  }
}

async function assertPendingEvidenceShape(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
  input: ClearHighAssuranceChallengeInput,
  now: Date,
): Promise<OperationHighAssuranceChallengeEvidence> {
  if (evidence === undefined) {
    return await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (evidence.clearedAt !== undefined) {
    return await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      "high-assurance challenge evidence is already cleared",
      boundEvidenceOptions(evidence),
    );
  }

  if (isChallengeEvidenceExpired(evidence.expiresAt, now)) {
    return await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.evidenceExpired,
      "high-assurance challenge evidence expired",
      boundEvidenceOptions(evidence),
    );
  }

  await assertBoundProjectMatch(evidence, input);
  await assertHumanSessionClearingActor(evidence, input);

  return evidence;
}

export async function requireSessionAssuranceForClear(
  input: ClearHighAssuranceChallengeInput,
  boundEvidence: OperationHighAssuranceChallengeEvidence | undefined,
): Promise<HighAssuranceAuthenticationMethodCode> {
  const boundOptions =
    boundEvidence !== undefined ? boundEvidenceOptions(boundEvidence) : undefined;
  const assurance = evaluateSessionAssurance(input.sessionAssurance);
  if (!assurance.ok) {
    return await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed,
      `session assurance failed: ${assurance.reason}`,
      {
        ...boundOptions,
        auditReasonCode: mapSessionAssuranceFailureToReasonCode(assurance.reason),
      },
    );
  }

  const authenticationMethodCode = mapSessionAssuranceToAuthenticationMethodCode(
    input.sessionAssurance,
  );
  if (authenticationMethodCode === null) {
    return await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed,
      "fresh high-assurance authentication method is required to clear challenge",
      boundOptions,
    );
  }

  return authenticationMethodCode;
}

export async function requireOperationWaitingForClear(
  operation: OperationPollResult,
  input: ClearHighAssuranceChallengeInput,
  boundEvidence: OperationHighAssuranceChallengeEvidence | undefined,
): Promise<void> {
  if (operation.state !== "waiting_for_human") {
    await deny(
      input,
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      `operation must be waiting_for_human to clear challenge, was ${operation.state}`,
      boundEvidence !== undefined ? boundEvidenceOptions(boundEvidence) : undefined,
    );
  }
}

export async function requirePendingChallengeEvidence(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
  input: ClearHighAssuranceChallengeInput,
  options?: { readonly now?: Date },
): Promise<OperationHighAssuranceChallengeEvidence> {
  return await assertPendingEvidenceShape(evidence, input, options?.now ?? new Date());
}

export async function assertClearingActorForClear(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
): Promise<void> {
  try {
    assertClearingActorForPendingChallenge({
      evidence,
      organizationId: input.organizationId,
      clearingUserId: input.clearingUserId,
      ...(input.requiredScopes !== undefined ? { requiredScopes: input.requiredScopes } : {}),
      ...(input.clearingUserAccess !== undefined
        ? { clearingUserAccess: input.clearingUserAccess }
        : {}),
    });
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await deny(input, error.code, error.message, boundEvidenceOptions(evidence));
    }
    throw error;
  }
}
