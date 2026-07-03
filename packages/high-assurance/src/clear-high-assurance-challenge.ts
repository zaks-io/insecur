import { generateAuditEventId } from "@insecur/audit";
import { type AuditEventId } from "@insecur/domain";
import {
  getOperation,
  recordOperationProgress,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { challengeAuditScopeFromBoundEvidence } from "./high-assurance-challenge-audit-scope.js";
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
import { recordHighAssuranceChallengeCleared } from "./record-high-assurance-challenge-audit.js";

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

async function persistClearedChallengeEvidence(
  input: ClearHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  authenticationMethodCode: string,
): Promise<OperationMutationResult> {
  const clearedAt = new Date().toISOString();
  const clearAuditEventId = generateAuditEventId();

  const mutationResult = await recordOperationProgress({
    organizationId: input.organizationId,
    operationId: input.operationId,
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
