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

function assertRequestRetryMatchesBoundEvidence(
  input: RequestHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
): void {
  if (input.projectId !== evidence.projectId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller project does not match bound challenge evidence",
    );
  }

  if (input.riskReasonCode !== evidence.riskReasonCode) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller risk reason does not match bound challenge evidence",
    );
  }

  if (input.environmentId !== evidence.environmentId) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "caller environment does not match bound challenge evidence",
    );
  }

  if (
    evidence.requestingUserId !== undefined &&
    input.requestingUserId !== evidence.requestingUserId
  ) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "caller requesting user does not match bound challenge evidence",
    );
  }

  if (
    evidence.requestingMachineIdentityId !== undefined &&
    input.requestingMachineIdentityId !== evidence.requestingMachineIdentityId
  ) {
    throw new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      "caller requesting machine identity does not match bound challenge evidence",
    );
  }
}

async function recordBoundRequestSuccessAudit(
  input: Pick<RequestHighAssuranceChallengeInput, "organizationId" | "operationId" | "request">,
  evidence: OperationHighAssuranceChallengeEvidence,
  requestAuditEventId: AuditEventId,
): Promise<void> {
  await recordHighAssuranceChallengeRequested({
    organizationId: input.organizationId,
    projectId: evidence.projectId,
    operationId: input.operationId,
    challengeId: evidence.challengeId,
    riskReasonCode: evidence.riskReasonCode,
    auditEventId: requestAuditEventId,
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

  assertRequestRetryMatchesBoundEvidence(input, evidence);

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
