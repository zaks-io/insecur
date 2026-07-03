import type { AuditEventId, OperationId, OrganizationId, RequestId, UserId } from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import { challengeAuditScopeFromBoundEvidence } from "./high-assurance-challenge-audit-scope.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import {
  recordHighAssuranceChallengeCleared,
  recordHighAssuranceChallengeRequested,
} from "./record-high-assurance-challenge-audit.js";

export interface ChallengeAuditFinalizationInput {
  organizationId: OrganizationId;
  operationId: OperationId;
  request?: { requestId: RequestId };
}

export function hasPersistedRequestAuditLinkage(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
): evidence is OperationHighAssuranceChallengeEvidence & { requestAuditEventId: AuditEventId } {
  return evidence?.requestAuditEventId !== undefined;
}

export function hasPendingRequestAuditFinalization(operation: OperationPollResult): boolean {
  const evidence = operation.progress.highAssuranceChallenge;
  return (
    operation.state === "waiting_for_human" &&
    evidence?.requestAuditEventId !== undefined &&
    evidence.consumedAt === undefined
  );
}

export function hasPersistedClearAuditLinkage(
  evidence: OperationHighAssuranceChallengeEvidence | undefined,
): evidence is OperationHighAssuranceChallengeEvidence & {
  clearedAt: string;
  clearAuditEventId: AuditEventId;
  clearAuthenticationMethodCode: string;
  clearingUserId: UserId;
} {
  return (
    evidence?.clearedAt !== undefined &&
    evidence.clearAuditEventId !== undefined &&
    evidence.clearAuthenticationMethodCode !== undefined &&
    evidence.clearingUserId !== undefined
  );
}

export async function finalizePendingRequestAudit(
  input: ChallengeAuditFinalizationInput,
  evidence: OperationHighAssuranceChallengeEvidence & { requestAuditEventId: AuditEventId },
): Promise<void> {
  await recordHighAssuranceChallengeRequested({
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    auditEventId: evidence.requestAuditEventId,
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
    ...optionalAuditRequest(input.request),
  });
}

async function finalizePendingClearAudit(
  input: ChallengeAuditFinalizationInput,
  evidence: OperationHighAssuranceChallengeEvidence & {
    clearedAt: string;
    clearAuditEventId: AuditEventId;
    clearAuthenticationMethodCode: string;
    clearingUserId: UserId;
  },
): Promise<void> {
  await recordHighAssuranceChallengeCleared({
    ...challengeAuditScopeFromBoundEvidence(input, evidence),
    clearingUserId: evidence.clearingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    clearAuthenticationMethodCode: evidence.clearAuthenticationMethodCode,
    auditEventId: evidence.clearAuditEventId,
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
  });
}

export async function finalizePendingChallengeAuditsInOrder(
  input: ChallengeAuditFinalizationInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<void> {
  if (hasPersistedRequestAuditLinkage(evidence)) {
    await finalizePendingRequestAudit(input, evidence);
  }

  if (hasPersistedClearAuditLinkage(evidence)) {
    await finalizePendingClearAudit(input, evidence);
  }
}
