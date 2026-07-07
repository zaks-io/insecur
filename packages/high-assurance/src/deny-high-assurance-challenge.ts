import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { generateAuditEventId } from "@insecur/audit";
import type { AuditEventId, UserId } from "@insecur/domain";
import {
  cancelOperation,
  getOperation,
  OPERATION_ERROR_CODES,
  OperationStoreError,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import type { DenyHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import { challengeAuditScopeFromBoundEvidence } from "./high-assurance-challenge-audit-scope.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import { isChallengeEvidenceExpired } from "./high-assurance-challenge-helpers.js";
import {
  finalizePendingDenyAudit,
  finalizePendingRequestAudit,
  hasPersistedDenyAuditLinkage,
  hasPersistedRequestAuditLinkage,
} from "./finalize-pending-challenge-audits.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import { optionalHighAssuranceEvidenceScopeFields } from "./optional-high-assurance-evidence-scope-fields.js";
import { recordHighAssuranceChallengeDenied } from "./record-high-assurance-challenge-audit.js";
import { assertClearingAuthorizationForEvidence } from "./validate-high-assurance-evidence-assertions.js";

export type { DenyHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";

function assertDenyAuthorization(
  input: DenyHighAssuranceChallengeInput,
  operation: OperationPollResult,
): void {
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (input.denyingUserAccess === undefined || input.requiredScopes === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      "high-assurance challenge denial requires denying user scopes and effective access",
    );
  }

  assertClearingAuthorizationForEvidence({
    evidence,
    organizationId: input.organizationId,
    requiredScopes: input.requiredScopes,
    clearingUserAccess: input.denyingUserAccess,
  });
}

function assertDenyablePendingChallenge(
  operation: OperationPollResult,
  input: DenyHighAssuranceChallengeInput,
): NonNullable<OperationPollResult["progress"]["highAssuranceChallenge"]> {
  if (operation.state !== "waiting_for_human") {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      `operation must be waiting_for_human to deny challenge, was ${operation.state}`,
    );
  }

  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing",
    );
  }

  if (evidence.clearedAt !== undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      "high-assurance challenge evidence is already cleared",
    );
  }

  if (isChallengeEvidenceExpired(evidence.expiresAt, new Date())) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceExpired,
      "high-assurance challenge evidence expired",
    );
  }

  assertDenyAuthorization(input, operation);
  return evidence;
}

function assertDenyingActorForDurableDeny(
  evidence: OperationHighAssuranceChallengeEvidence & { denyingUserId: UserId },
  input: DenyHighAssuranceChallengeInput,
): void {
  if (evidence.denyingUserId !== input.denyingUserId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "denying user does not match bound challenge denial evidence",
    );
  }
}

async function recordBoundDenySuccessAudit(
  input: DenyHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  denyAuditEventId: AuditEventId,
): Promise<void> {
  await recordHighAssuranceChallengeDenied({
    ...challengeAuditScopeFromBoundEvidence(input, evidence),
    denyingUserId: input.denyingUserId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    auditEventId: denyAuditEventId,
    ...optionalHighAssuranceEvidenceScopeFields(evidence),
    ...optionalAuditRequest(input.request),
  });
}

async function persistCanceledDeny(
  input: DenyHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<OperationMutationResult> {
  const denyAuditEventId = generateAuditEventId();

  let mutation: OperationMutationResult;
  try {
    mutation = await cancelOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
      highAssuranceDenyCas: { challengeId: evidence.challengeId },
      progress: {
        highAssuranceChallenge: {
          ...evidence,
          denyingUserId: input.denyingUserId,
          denyAuditEventId,
        },
        auditEventIds: [denyAuditEventId],
      },
    });
  } catch (error) {
    if (
      error instanceof OperationStoreError &&
      error.code === OPERATION_ERROR_CODES.staleTransition
    ) {
      throw new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
        "high-assurance challenge evidence is already cleared",
      );
    }
    throw error;
  }

  if (hasPersistedRequestAuditLinkage(evidence)) {
    await finalizePendingRequestAudit(input, evidence);
  }
  await recordBoundDenySuccessAudit(input, evidence, denyAuditEventId);

  return mutation;
}

async function completeDurableDeny(
  operation: OperationPollResult,
  input: DenyHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  if (!hasPersistedDenyAuditLinkage(operation)) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "canceled high-assurance challenge evidence is missing deny audit linkage",
    );
  }

  const evidence = operation.progress.highAssuranceChallenge;

  assertDenyingActorForDurableDeny(evidence, input);
  assertDenyAuthorization(input, operation);

  if (hasPersistedRequestAuditLinkage(evidence)) {
    await finalizePendingRequestAudit(input, evidence);
  }
  await finalizePendingDenyAudit(input, evidence);

  return { operation, created: false };
}

export async function denyHighAssuranceChallenge(
  input: DenyHighAssuranceChallengeInput,
): Promise<OperationPollResult> {
  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  if (hasPersistedDenyAuditLinkage(operation)) {
    return (await completeDurableDeny(operation, input)).operation;
  }

  const evidence = assertDenyablePendingChallenge(operation, input);
  return (await persistCanceledDeny(input, evidence)).operation;
}

export const DENY_HIGH_ASSURANCE_CHALLENGE_REQUIRED_SCOPES = [
  AUTHORIZATION_SCOPES.approvalReject,
] as const;
