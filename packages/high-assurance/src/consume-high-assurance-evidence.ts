import { auditEventId } from "@insecur/domain";
import {
  getOperation,
  transitionOperation,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";
import { HighAssuranceChallengeError } from "./high-assurance-challenge-error.js";
import {
  denyConsumeNotWaiting,
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

async function transitionWithConsumedEvidence(
  input: ConsumeHighAssuranceEvidenceInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  consumeAuditEventId: string,
): Promise<OperationMutationResult> {
  const consumedAt = new Date().toISOString();
  try {
    return await transitionOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: "running",
      progress: {
        highAssuranceChallenge: {
          ...evidence,
          consumedAt,
          consumeAuditEventId: auditEventId.brand(consumeAuditEventId),
        },
        auditEventIds: [auditEventId.brand(consumeAuditEventId)],
      },
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    });
  } catch (error) {
    await recordConsumeTransitionDenied(evidence, input);
    throw error;
  }
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

  const evidence = await loadValidatedEvidence(operation, input);
  if (operation.state !== "waiting_for_human") {
    await denyConsumeNotWaiting(evidence, input, operation.state);
  }

  const consumeAudit = await recordHighAssuranceEvidenceConsumed({
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    clearingUserId: input.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...optionalAuditRequest(input.request),
  });

  return await transitionWithConsumedEvidence(input, evidence, consumeAudit.auditEventId);
}
