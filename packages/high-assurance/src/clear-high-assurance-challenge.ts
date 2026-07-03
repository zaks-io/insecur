import { generateAuditEventId } from "@insecur/audit";
import { type AuditEventId } from "@insecur/domain";
import {
  getOperation,
  OPERATION_ERROR_CODES,
  OperationStoreError,
  recordOperationProgressClearHighAssuranceChallenge,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import {
  challengeAuditScopeFromBoundEvidence,
  clearDeniedAuditScope,
} from "./high-assurance-challenge-audit-scope.js";
import {
  assertClearingActorForClear,
  requireOperationWaitingForClear,
  requirePendingChallengeEvidence,
  requireSessionAssuranceForClear,
} from "./clear-high-assurance-challenge-preflight.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import {
  finalizePendingChallengeAuditsInOrder,
  finalizePendingRequestAudit,
  hasPersistedClearAuditLinkage,
  hasPersistedRequestAuditLinkage,
} from "./finalize-pending-challenge-audits.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import {
  recordHighAssuranceChallengeClearDenied,
  recordHighAssuranceChallengeCleared,
} from "./record-high-assurance-challenge-audit.js";

export type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";

async function recordBoundClearSuccessAudit(
  input: ClearHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  authenticationMethodCode: string,
  clearAuditEventId: AuditEventId,
): Promise<void> {
  await recordHighAssuranceChallengeCleared({
    ...challengeAuditScopeFromBoundEvidence(input, evidence),
    clearingUserId: input.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    clearAuthenticationMethodCode: authenticationMethodCode,
    auditEventId: clearAuditEventId,
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
    ...optionalAuditRequest(input.request),
  });
}

async function recordClearPersistDenied(
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
  reasonCode: (typeof HIGH_ASSURANCE_ERROR_CODES)[keyof typeof HIGH_ASSURANCE_ERROR_CODES],
): Promise<void> {
  await recordHighAssuranceChallengeClearDenied({
    ...clearDeniedAuditScope(input, evidence),
    reasonCode,
    riskReasonCode: evidence.riskReasonCode,
  });
}

async function handleClearPersistStoreError(
  error: unknown,
  evidence: OperationHighAssuranceChallengeEvidence,
  input: ClearHighAssuranceChallengeInput,
): Promise<never> {
  if (error instanceof OperationStoreError) {
    if (error.code === OPERATION_ERROR_CODES.staleTransition) {
      await recordClearPersistDenied(evidence, input, HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed);
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
        "high-assurance challenge evidence is already cleared",
      );
    }
    if (error.code === OPERATION_ERROR_CODES.invalidTransition) {
      await recordClearPersistDenied(evidence, input, HIGH_ASSURANCE_ERROR_CODES.clearingDenied);
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
        error.message,
      );
    }
  }
  throw error;
}

async function persistClearedChallengeEvidence(
  input: ClearHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  authenticationMethodCode: string,
): Promise<OperationMutationResult> {
  const clearedAt = new Date().toISOString();
  const clearAuditEventId = generateAuditEventId();

  let mutationResult: OperationMutationResult;
  try {
    mutationResult = await recordOperationProgressClearHighAssuranceChallenge({
      organizationId: input.organizationId,
      operationId: input.operationId,
      challengeId: evidence.challengeId,
      progress: {
        highAssuranceChallenge: {
          ...evidence,
          clearedAt,
          clearingUserId: input.clearingUserId,
          clearAuthenticationMethodCode: authenticationMethodCode,
          clearAuditEventId,
        },
        auditEventIds: [clearAuditEventId],
      },
    });
  } catch (error) {
    return await handleClearPersistStoreError(error, evidence, input);
  }

  if (hasPersistedRequestAuditLinkage(evidence)) {
    await finalizePendingRequestAudit(input, evidence);
  }
  await recordBoundClearSuccessAudit(input, evidence, authenticationMethodCode, clearAuditEventId);

  return mutationResult;
}

async function completeDurableClear(
  operation: OperationPollResult,
  input: ClearHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  const evidence = operation.progress.highAssuranceChallenge;
  if (!hasPersistedClearAuditLinkage(evidence)) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "cleared high-assurance challenge evidence is missing clear audit linkage",
    );
  }

  await assertClearingActorForClear(evidence, input);
  await finalizePendingChallengeAuditsInOrder(input, evidence);

  return { operation, created: false };
}

export async function clearHighAssuranceChallenge(
  input: ClearHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  if (hasPersistedClearAuditLinkage(operation.progress.highAssuranceChallenge)) {
    return await completeDurableClear(operation, input);
  }

  const pendingEvidence = operation.progress.highAssuranceChallenge;

  const authenticationMethodCode = await requireSessionAssuranceForClear(input, pendingEvidence);
  await requireOperationWaitingForClear(operation, input, pendingEvidence);
  const evidence = await requirePendingChallengeEvidence(pendingEvidence, input);
  await assertClearingActorForClear(evidence, input);

  return await persistClearedChallengeEvidence(input, evidence, authenticationMethodCode);
}
