import {
  PRODUCTION_AUDIT_EVENT_CODES,
  type AuditEventDetails,
  writeAuditEvent,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type UserId,
} from "@insecur/domain";

function challengeAuditDetails(input: {
  challengeId: string;
  riskReasonCode: string;
  requestingUserId?: UserId;
  requestingMachineIdentityId?: string;
  clearingUserId?: UserId;
}): AuditEventDetails {
  return {
    challengeId: input.challengeId,
    riskReasonCode: input.riskReasonCode,
    ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
    ...(input.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: input.requestingMachineIdentityId }
      : {}),
    ...(input.clearingUserId !== undefined ? { clearingUserId: input.clearingUserId } : {}),
  };
}

interface ChallengeAuditScope {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  request?: { requestId: RequestId };
}

function scopedAuditFields(scope: ChallengeAuditScope) {
  return {
    organizationId: scope.organizationId,
    ...(scope.projectId !== undefined ? { projectId: scope.projectId } : {}),
    operation: { operationId: scope.operationId },
    ...(scope.environmentId !== undefined ? { environmentId: scope.environmentId } : {}),
    ...(scope.request !== undefined ? { request: scope.request } : {}),
  };
}

function userActor(userId: UserId | undefined) {
  return userId !== undefined
    ? { type: "user" as const, userId }
    : { type: "user" as const, userId: null };
}

function operationResource(operationId: OperationId) {
  return {
    type: "operation" as const,
    id: brandOpaqueResourceIdForPrefix("op", operationId),
  };
}

export async function recordHighAssuranceChallengeRequested(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  requestingUserId?: UserId;
  challengeId: string;
  riskReasonCode: string;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequested,
    outcome: "success",
    actor: userActor(input.requestingUserId),
    ...scopedAuditFields(input),
    resource: operationResource(input.operationId),
    details: challengeAuditDetails({
      challengeId: input.challengeId,
      riskReasonCode: input.riskReasonCode,
      ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
    }),
  });

  return { auditEventId: result.auditEventId };
}

export async function recordHighAssuranceChallengeRequestDenied(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  requestingUserId?: UserId;
  reasonCode: KnownErrorCode;
  riskReasonCode: string;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequestDenied,
    outcome: "denied",
    actor: userActor(input.requestingUserId),
    ...scopedAuditFields(input),
    denial: { reasonCode: input.reasonCode },
    details: { riskReasonCode: input.riskReasonCode },
  });
}

export async function recordHighAssuranceChallengeCleared(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  clearingUserId: UserId;
  requestingUserId?: UserId;
  requestingMachineIdentityId?: string;
  challengeId: string;
  riskReasonCode: string;
  clearAuthenticationMethodCode: string;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeCleared,
    outcome: "success",
    actor: { type: "user", userId: input.clearingUserId },
    ...scopedAuditFields(input),
    resource: operationResource(input.operationId),
    details: {
      ...challengeAuditDetails({
        challengeId: input.challengeId,
        riskReasonCode: input.riskReasonCode,
        ...(input.requestingUserId !== undefined
          ? { requestingUserId: input.requestingUserId }
          : {}),
        ...(input.requestingMachineIdentityId !== undefined
          ? { requestingMachineIdentityId: input.requestingMachineIdentityId }
          : {}),
        clearingUserId: input.clearingUserId,
      }),
      clearAuthenticationMethodCode: input.clearAuthenticationMethodCode,
    },
  });

  return { auditEventId: result.auditEventId };
}

export async function recordHighAssuranceChallengeClearDenied(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  clearingUserId: UserId;
  reasonCode: KnownErrorCode;
  riskReasonCode?: string;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeClearDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.clearingUserId },
    ...scopedAuditFields(input),
    denial: { reasonCode: input.reasonCode },
    ...(input.riskReasonCode !== undefined
      ? { details: { riskReasonCode: input.riskReasonCode } }
      : {}),
  });
}

export async function recordHighAssuranceEvidenceConsumed(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  clearingUserId: UserId;
  challengeId: string;
  riskReasonCode: string;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceEvidenceConsumed,
    outcome: "success",
    actor: { type: "user", userId: input.clearingUserId },
    ...scopedAuditFields(input),
    resource: operationResource(input.operationId),
    details: challengeAuditDetails({
      challengeId: input.challengeId,
      riskReasonCode: input.riskReasonCode,
      clearingUserId: input.clearingUserId,
    }),
  });

  return { auditEventId: result.auditEventId };
}

export async function recordHighAssuranceEvidenceConsumeDenied(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  reasonCode: KnownErrorCode;
  requestingUserId?: UserId;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceEvidenceConsumeDenied,
    outcome: "denied",
    actor: userActor(input.requestingUserId),
    ...scopedAuditFields(input),
    denial: { reasonCode: input.reasonCode },
  });
}
