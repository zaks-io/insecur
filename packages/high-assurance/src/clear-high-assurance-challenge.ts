import { auditEventId } from "@insecur/domain";
import {
  getOperation,
  recordOperationProgress,
  type OperationMutationResult,
} from "@insecur/operations";
import type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { challengeAuditScopeFromBoundEvidence } from "./high-assurance-challenge-audit-scope.js";
import {
  assertClearingActorForClear,
  requireOperationWaitingForClear,
  requirePendingChallengeEvidence,
  requireSessionAssuranceForClear,
} from "./clear-high-assurance-challenge-preflight.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import { recordHighAssuranceChallengeCleared } from "./record-high-assurance-challenge-audit.js";

export type { ClearHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";

async function persistClearedChallengeEvidence(
  input: ClearHighAssuranceChallengeInput,
  evidence: NonNullable<
    Awaited<ReturnType<typeof getOperation>>["progress"]["highAssuranceChallenge"]
  >,
  authenticationMethodCode: string,
): Promise<OperationMutationResult> {
  const clearedAt = new Date().toISOString();
  const clearAudit = await recordHighAssuranceChallengeCleared({
    ...challengeAuditScopeFromBoundEvidence(input, evidence),
    clearingUserId: input.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    clearAuthenticationMethodCode: authenticationMethodCode,
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
    ...optionalAuditRequest(input.request),
  });

  return await recordOperationProgress({
    organizationId: input.organizationId,
    operationId: input.operationId,
    progress: {
      highAssuranceChallenge: {
        ...evidence,
        clearedAt,
        clearingUserId: input.clearingUserId,
        clearAuthenticationMethodCode: authenticationMethodCode,
        clearAuditEventId: auditEventId.brand(clearAudit.auditEventId),
      },
      auditEventIds: [auditEventId.brand(clearAudit.auditEventId)],
    },
  });
}

export async function clearHighAssuranceChallenge(
  input: ClearHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  const pendingEvidence = operation.progress.highAssuranceChallenge;

  const authenticationMethodCode = await requireSessionAssuranceForClear(input, pendingEvidence);
  await requireOperationWaitingForClear(operation, input, pendingEvidence);
  const evidence = await requirePendingChallengeEvidence(pendingEvidence, input);
  await assertClearingActorForClear(evidence, input);

  return await persistClearedChallengeEvidence(input, evidence, authenticationMethodCode);
}
