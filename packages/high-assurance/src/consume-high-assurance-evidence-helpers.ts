import type { AuditEventId } from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import {
  recordHighAssuranceEvidenceConsumeDenied,
  recordHighAssuranceEvidenceConsumed,
} from "./record-high-assurance-challenge-audit.js";

function consumeAuditActorFields(input: ConsumeHighAssuranceEvidenceInput) {
  return {
    ...(input.resumingUserId !== undefined ? { requestingUserId: input.resumingUserId } : {}),
    ...(input.resumingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: input.resumingMachineIdentityId }
      : {}),
  };
}

function consumeAuditDeniedFields(
  input: ConsumeHighAssuranceEvidenceInput,
  evidence: OperationHighAssuranceChallengeEvidence,
) {
  return {
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    ...consumeAuditActorFields(input),
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  };
}

export function isConsumeAlreadyDurable(operation: OperationPollResult): boolean {
  const evidence = operation.progress.highAssuranceChallenge;
  return (
    operation.state === "running" &&
    evidence?.consumedAt !== undefined &&
    evidence.consumeAuditEventId !== undefined
  );
}

export async function recordBoundConsumeSuccessAudit(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ConsumeHighAssuranceEvidenceInput,
  consumeAuditEventId: AuditEventId,
): Promise<void> {
  if (evidence.clearingUserId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is not cleared",
    );
  }

  await recordHighAssuranceEvidenceConsumed({
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    clearingUserId: evidence.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    auditEventId: consumeAuditEventId,
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  });
}

export function buildConsumedEvidenceProgress(
  evidence: OperationHighAssuranceChallengeEvidence,
  consumedAt: string,
  consumeAuditEventId: AuditEventId,
) {
  return {
    highAssuranceChallenge: {
      ...evidence,
      consumedAt,
      consumeAuditEventId,
    },
    auditEventIds: [consumeAuditEventId],
  };
}

export async function recordConsumeValidationDenied(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
  error: HighAssuranceChallengeError,
): Promise<void> {
  const boundEvidence = operation.progress.highAssuranceChallenge;
  if (boundEvidence === undefined) {
    return;
  }

  await recordHighAssuranceEvidenceConsumeDenied({
    ...consumeAuditDeniedFields(input, boundEvidence),
    reasonCode: error.code,
  });
}

export async function denyConsumeNotWaiting(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ConsumeHighAssuranceEvidenceInput,
  operationState: OperationPollResult["state"],
): Promise<never> {
  await recordHighAssuranceEvidenceConsumeDenied({
    ...consumeAuditDeniedFields(input, evidence),
    reasonCode: HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
  });
  throw new HighAssuranceChallengeError(
    HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
    `operation must be waiting_for_human to consume evidence, was ${operationState}`,
  );
}

export async function recordConsumeTransitionDenied(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ConsumeHighAssuranceEvidenceInput,
): Promise<void> {
  await recordHighAssuranceEvidenceConsumeDenied({
    ...consumeAuditDeniedFields(input, evidence),
    reasonCode: HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
  });
}
