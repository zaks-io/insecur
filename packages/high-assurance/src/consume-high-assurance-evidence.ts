import { generateAuditEventId } from "@insecur/audit";
import type { AuditEventId } from "@insecur/domain";
import {
  getOperation,
  transitionOperation,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import {
  buildConsumedEvidenceProgress,
  denyConsumeNotWaiting,
  finalizeConsumeAudit,
  isConsumeAlreadyDurable,
  recordConsumeTransitionDenied,
  recordConsumeValidationDenied,
} from "./consume-high-assurance-evidence-helpers.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import { recordHighAssuranceEvidenceConsumed } from "./record-high-assurance-challenge-audit.js";
import { validateHighAssuranceEvidence } from "./validate-high-assurance-evidence.js";

export type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";

async function loadValidatedEvidence(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
): Promise<OperationHighAssuranceChallengeEvidence> {
  try {
    const validationInput = {
      operation,
      clearingUserId: input.clearingUserId,
      ...(input.requiredScopes !== undefined ? { requiredScopes: input.requiredScopes } : {}),
      ...(input.clearingUserAccess !== undefined
        ? { clearingUserAccess: input.clearingUserAccess }
        : {}),
    };
    return validateHighAssuranceEvidence(validationInput).evidence;
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await recordConsumeValidationDenied(operation, input, error);
    }
    throw error;
  }
}

async function recordConsumeSuccessAudit(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ConsumeHighAssuranceEvidenceInput,
  consumeAuditEventId: AuditEventId,
): Promise<void> {
  await recordHighAssuranceEvidenceConsumed({
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    clearingUserId: input.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    auditEventId: consumeAuditEventId,
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  });
}

async function transitionAndAuditConsumedEvidence(
  input: ConsumeHighAssuranceEvidenceInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<OperationMutationResult> {
  const consumedAt = new Date().toISOString();
  const consumeAuditEventId = generateAuditEventId();

  let transitionResult: OperationMutationResult;
  try {
    transitionResult = await transitionOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: "running",
      progress: buildConsumedEvidenceProgress(evidence, consumedAt, consumeAuditEventId),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    });
  } catch (error) {
    await recordConsumeTransitionDenied(evidence, input);
    throw error;
  }

  await recordConsumeSuccessAudit(evidence, input, consumeAuditEventId);

  return transitionResult;
}

async function completeDurableConsume(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
): Promise<OperationMutationResult> {
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence?.consumeAuditEventId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "consumed high-assurance challenge evidence is missing consume audit linkage",
    );
  }

  await finalizeConsumeAudit(
    { ...evidence, consumeAuditEventId: evidence.consumeAuditEventId },
    input,
  );

  return { operation, created: false };
}

/**
 * Atomically consumes single-use cleared evidence while transitioning
 * waiting_for_human → running (ADR-0032 amendment).
 */
export async function consumeHighAssuranceEvidence(
  input: ConsumeHighAssuranceEvidenceInput,
): Promise<OperationMutationResult> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  if (isConsumeAlreadyDurable(operation)) {
    return await completeDurableConsume(operation, input);
  }

  const evidence = await loadValidatedEvidence(operation, input);
  if (operation.state !== "waiting_for_human") {
    await denyConsumeNotWaiting(evidence, input, operation.state);
  }

  return await transitionAndAuditConsumedEvidence(input, evidence);
}
