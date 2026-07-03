import { AUTH_ERROR_CODES, auditEventId } from "@insecur/domain";
import {
  getOperation,
  transitionOperation,
  type OperationHighAssuranceChallengeEvidence,
  type OperationMutationResult,
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
  requestAuditEventId: string;
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
    requestAuditEventId: auditEventId.brand(requestAuditEventId),
  };
}

async function transitionToWaitingForHuman(
  input: RequestHighAssuranceChallengeInput,
  evidence: OperationHighAssuranceChallengeEvidence,
  requestAuditEventId: string,
): Promise<OperationMutationResult> {
  try {
    return await transitionOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: "waiting_for_human",
      progress: {
        wait: { reasonCode: AUTH_ERROR_CODES.highAssuranceRequired, until: evidence.expiresAt },
        highAssuranceChallenge: evidence,
        auditEventIds: [auditEventId.brand(requestAuditEventId)],
      },
    });
  } catch (error) {
    await recordHighAssuranceChallengeRequestDenied({
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.operationId,
      reasonCode: HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      riskReasonCode: input.riskReasonCode,
      ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
      ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
      ...optionalAuditRequest(input.request),
    });
    throw error;
  }
}

export async function requestHighAssuranceChallenge(
  input: RequestHighAssuranceChallengeInput,
): Promise<OperationMutationResult> {
  assertRiskReasonCode(input.riskReasonCode);
  assertRequestActor(input);

  await getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  const requestedAt = new Date();
  const challengeId = generateChallengeId();
  const expiresAt = computeChallengeExpiresAt(
    requestedAt,
    input.ttlSeconds ?? DEFAULT_HIGH_ASSURANCE_CHALLENGE_TTL_SECONDS,
  );

  const requestAudit = await recordHighAssuranceChallengeRequested({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    challengeId,
    riskReasonCode: input.riskReasonCode,
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
    ...optionalAuditRequest(input.request),
  });

  const evidence = buildChallengeEvidence({
    request: input,
    challengeId,
    requestedAt,
    expiresAt,
    requestAuditEventId: requestAudit.auditEventId,
  });

  return await transitionToWaitingForHuman(input, evidence, requestAudit.auditEventId);
}
