import { generateAuditEventId } from "@insecur/audit";
import {
  getOperation,
  transitionOperationConsumeHighAssuranceEvidence,
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
  isConsumeAlreadyDurable,
  recordBoundConsumeSuccessAudit,
  recordConsumeTransitionDenied,
  recordConsumeValidationDenied,
} from "./consume-high-assurance-evidence-helpers.js";
import { finalizePendingChallengeAuditsInOrder } from "./finalize-pending-challenge-audits.js";
import {
  buildValidateConsumeActorInput,
  buildValidateHighAssuranceEvidenceInput,
  validateConsumeActor,
  validateHighAssuranceEvidence,
} from "./validate-high-assurance-evidence.js";

export type { ConsumeHighAssuranceEvidenceInput } from "./high-assurance-challenge-inputs.js";

async function validateConsumeActorOrDeny(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<void> {
  try {
    validateConsumeActor(
      buildValidateConsumeActorInput({
        organizationId: input.organizationId,
        projectId: input.projectId,
        evidence,
        environmentId: input.environmentId,
        resumingUserId: input.resumingUserId,
        resumingMachineIdentityId: input.resumingMachineIdentityId,
        clearingUserId: input.clearingUserId,
        requiredScopes: input.requiredScopes,
        clearingUserAccess: input.clearingUserAccess,
      }),
    );
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await recordConsumeValidationDenied(operation, input, error);
    }
    throw error;
  }
}

async function loadValidatedEvidence(
  operation: OperationPollResult,
  input: ConsumeHighAssuranceEvidenceInput,
): Promise<OperationHighAssuranceChallengeEvidence> {
  try {
    return validateHighAssuranceEvidence(buildValidateHighAssuranceEvidenceInput(operation, input))
      .evidence;
  } catch (error) {
    if (error instanceof HighAssuranceChallengeError) {
      await recordConsumeValidationDenied(operation, input, error);
    }
    throw error;
  }
}

async function transitionAndAuditConsumedEvidence(
  input: ConsumeHighAssuranceEvidenceInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<OperationMutationResult> {
  const consumedAt = new Date().toISOString();
  const consumeAuditEventId = generateAuditEventId();

  let transitionResult: OperationMutationResult;
  try {
    transitionResult = await transitionOperationConsumeHighAssuranceEvidence({
      organizationId: input.organizationId,
      operationId: input.operationId,
      challengeId: evidence.challengeId,
      progress: buildConsumedEvidenceProgress(evidence, consumedAt, consumeAuditEventId),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    });
  } catch (error) {
    await recordConsumeTransitionDenied(evidence, input);
    throw error;
  }

  await finalizePendingChallengeAuditsInOrder(input, evidence);
  await recordBoundConsumeSuccessAudit(evidence, input, consumeAuditEventId);

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

  await validateConsumeActorOrDeny(operation, input, evidence);

  await finalizePendingChallengeAuditsInOrder(input, evidence);
  await recordBoundConsumeSuccessAudit(evidence, input, evidence.consumeAuditEventId);

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
