import { generateAuditEventId } from "@insecur/audit";
import { AUTH_ERROR_CODES, type AuditEventId } from "@insecur/domain";
import {
  getOperation,
  transitionOperation,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
  type OperationPollResult,
} from "@insecur/operations";
import { DEFAULT_HIGH_ASSURANCE_CHALLENGE_TTL_SECONDS } from "./constants.js";
import type { RequestHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";
import {
  HIGH_ASSURANCE_ERROR_CODES,
  HighAssuranceChallengeError,
} from "./high-assurance-challenge-error.js";
import {
  computeChallengeExpiresAt,
  generateChallengeId,
} from "./high-assurance-challenge-helpers.js";
import { isHighAssuranceRiskReasonCode } from "./high-assurance-risk-reason-codes.js";
import { mapOperationStoreErrorToDenialReason } from "./map-operation-store-denial.js";
import { optionalAuditRequest } from "./optional-audit-request.js";
import {
  recordHighAssuranceChallengeRequestDenied,
  recordHighAssuranceChallengeRequested,
} from "./record-high-assurance-challenge-audit.js";

export type { RequestHighAssuranceChallengeInput } from "./high-assurance-challenge-inputs.js";

function assertRequestActor(input: RequestHighAssuranceChallengeInput): void {
  if (input.requestingUserId === undefined && input.requestingMachineIdentityId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      "high-assurance challenge requires a requesting user or machine identity",
    );
  }
}

function assertRiskReasonCode(riskReasonCode: string): void {
  if (!isHighAssuranceRiskReasonCode(riskReasonCode)) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.invalidRiskReason,
      `unknown high-assurance risk reason: ${riskReasonCode}`,
    );
  }
}

function buildChallengeEvidence(input: {
  request: RequestHighAssuranceChallengeInput;
  challengeId: string;
  requestedAt: Date;
  expiresAt: string;
  requestAuditEventId: AuditEventId;
}): OperationHighAssuranceChallengeEvidence {
  const { request, challengeId, requestedAt, expiresAt, requestAuditEventId } = input;
  return {
    challengeId,
    riskReasonCode: request.riskReasonCode,
    projectId: request.projectId,
    ...(request.environmentId !== undefined ? { environmentId: request.environmentId } : {}),
    ...(request.requestingUserId !== undefined
      ? { requestingUserId: request.requestingUserId }
      : {}),
    ...(request.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: request.requestingMachineIdentityId }
      : {}),
    requestedAt: requestedAt.toISOString(),
    expiresAt,
    requestAuditEventId,
  };
}

function isRequestAlreadyDurable(operation: OperationPollResult): boolean {
  const evidence = operation.progress.highAssuranceChallenge;
  return operation.state === "waiting_for_human" && evidence?.requestAuditEventId !== undefined;
}

async function recordBoundRequestSuccessAudit(
  input: RequestHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  requestAuditEventId: AuditEventId,
): Promise<void> {
  await recordHighAssuranceChallengeRequested({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    challengeId: evidence.challengeId,
    riskReasonCode: input.riskReasonCode,
    auditEventId: requestAuditEventId,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
    ...(input.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: input.requestingMachineIdentityId }
      : {}),
    ...optionalAuditRequest(input.request),
  });
}

async function transitionToWaitingForHuman(
  input: RequestHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): Promise<OperationMutationResult> {
  try {
    return await transitionOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: "waiting_for_human",
      progress: {
        wait: { reasonCode: AUTH_ERROR_CODES.highAssuranceRequired, until: evidence.expiresAt },
        highAssuranceChallenge: evidence,
        auditEventIds: [evidence.requestAuditEventId],
      },
    });
  } catch (error) {
    await recordHighAssuranceChallengeRequestDenied({
      organizationId: input.organizationId,
      projectId: evidence.projectId,
      operationId: input.operationId,
      reasonCode: mapOperationStoreErrorToDenialReason(error),
      riskReasonCode: input.riskReasonCode,
      ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
      ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
      ...(input.requestingMachineIdentityId !== undefined
        ? { requestingMachineIdentityId: input.requestingMachineIdentityId }
        : {}),
      ...optionalAuditRequest(input.request),
    });
    throw error;
  }
}

async function completeDurableRequest(
  operation: OperationPollResult,
  input: RequestHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence?.requestAuditEventId === undefined) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "high-assurance challenge evidence is missing request audit linkage",
    );
  }

  await recordBoundRequestSuccessAudit(input, evidence, evidence.requestAuditEventId);

  return { operation, created: false };
}

export async function requestHighAssuranceChallenge(
  input: RequestHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  assertRiskReasonCode(input.riskReasonCode);
  assertRequestActor(input);

  const operation = await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  if (isRequestAlreadyDurable(operation)) {
    return await completeDurableRequest(operation, input);
  }

  const requestedAt = new Date();
  const challengeId = generateChallengeId();
  const expiresAt = computeChallengeExpiresAt(
    requestedAt,
    input.ttlSeconds ?? DEFAULT_HIGH_ASSURANCE_CHALLENGE_TTL_SECONDS,
  );
  const requestAuditEventId = generateAuditEventId();

  const evidence = buildChallengeEvidence({
    request: input,
    challengeId,
    requestedAt,
    expiresAt,
    requestAuditEventId,
  });

  const transitionResult = await transitionToWaitingForHuman(input, evidence);
  await recordBoundRequestSuccessAudit(input, evidence, requestAuditEventId);

  return transitionResult;
}
