import type { OperationId } from "@insecur/domain";
import type { OperationHighAssuranceChallengeEvidence } from "@insecur/operations";
import { isChallengeEvidenceExpired } from "./high-assurance-challenge-helpers.js";
import type { HighAssuranceChallengeStatus } from "./high-assurance-challenge-types.js";

function statusBase(operationId: OperationId) {
  return {
    operationId,
    hasClearedEvidence: false,
  } satisfies Pick<HighAssuranceChallengeStatus, "operationId" | "hasClearedEvidence">;
}

function sharedEvidenceFields(evidence: OperationHighAssuranceChallengeEvidence) {
  return {
    projectId: evidence.projectId,
    riskReasonCode: evidence.riskReasonCode,
    expiresAt: evidence.expiresAt,
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
  };
}

function optionalClearingFields(evidence: OperationHighAssuranceChallengeEvidence) {
  return {
    ...(evidence.clearingUserId !== undefined ? { clearingUserId: evidence.clearingUserId } : {}),
    ...(evidence.clearedAt !== undefined ? { clearedAt: evidence.clearedAt } : {}),
  };
}

function consumedStatus(
  operationId: OperationId,
  evidence: OperationHighAssuranceChallengeEvidence & { consumedAt: string },
): HighAssuranceChallengeStatus {
  return {
    ...statusBase(operationId),
    ...sharedEvidenceFields(evidence),
    state: "consumed",
    consumedAt: evidence.consumedAt,
    hasClearedEvidence: true,
    ...optionalClearingFields(evidence),
  };
}

function expiredStatus(
  operationId: OperationId,
  evidence: OperationHighAssuranceChallengeEvidence,
): HighAssuranceChallengeStatus {
  return {
    ...statusBase(operationId),
    ...sharedEvidenceFields(evidence),
    state: "expired",
    hasClearedEvidence: evidence.clearedAt !== undefined,
    ...optionalClearingFields(evidence),
  };
}

function clearedStatus(
  operationId: OperationId,
  evidence: OperationHighAssuranceChallengeEvidence & {
    clearedAt: string;
    clearingUserId: NonNullable<OperationHighAssuranceChallengeEvidence["clearingUserId"]>;
  },
): HighAssuranceChallengeStatus {
  return {
    ...statusBase(operationId),
    ...sharedEvidenceFields(evidence),
    state: "cleared",
    clearedAt: evidence.clearedAt,
    clearingUserId: evidence.clearingUserId,
    hasClearedEvidence: true,
  };
}

function pendingStatus(
  operationId: OperationId,
  evidence: OperationHighAssuranceChallengeEvidence,
): HighAssuranceChallengeStatus {
  return {
    ...statusBase(operationId),
    ...sharedEvidenceFields(evidence),
    state: "pending",
    hasClearedEvidence: false,
  };
}

export function resolveHighAssuranceChallengeStatus(input: {
  readonly operationId: OperationId;
  readonly highAssuranceChallenge?: OperationHighAssuranceChallengeEvidence;
  readonly now?: string;
}): HighAssuranceChallengeStatus {
  const evidence = input.highAssuranceChallenge;
  if (evidence === undefined) {
    return { ...statusBase(input.operationId), state: "not_required" };
  }

  const now = input.now !== undefined ? new Date(input.now) : new Date();
  if (evidence.consumedAt !== undefined) {
    return consumedStatus(input.operationId, { ...evidence, consumedAt: evidence.consumedAt });
  }
  if (isChallengeEvidenceExpired(evidence.expiresAt, now)) {
    return expiredStatus(input.operationId, evidence);
  }
  if (evidence.clearedAt !== undefined && evidence.clearingUserId !== undefined) {
    return clearedStatus(input.operationId, {
      ...evidence,
      clearedAt: evidence.clearedAt,
      clearingUserId: evidence.clearingUserId,
    });
  }
  return pendingStatus(input.operationId, evidence);
}
