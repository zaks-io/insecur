import {
  PRODUCTION_AUDIT_EVENT_CODES,
  type AuditEventActorRef,
  type AuditEventDetails,
  type AuditEventInput,
  writeAuditEvent,
  writeAuditEventWithId,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type AuditEventId,
  type EnvironmentId,
  type KnownErrorCode,
  type MachineIdentityId,
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
  requestingMachineIdentityId?: MachineIdentityId;
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

function userActor(userId: UserId | undefined): AuditEventActorRef {
  return userId !== undefined
    ? { type: "user" as const, userId }
    : { type: "user" as const, userId: null };
}

function challengeRequestActor(input: {
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
}): AuditEventActorRef {
  if (input.requestingMachineIdentityId !== undefined) {
    return { type: "machine", machineIdentityId: input.requestingMachineIdentityId };
  }
  return userActor(input.requestingUserId);
}

function operationResource(operationId: OperationId) {
  return {
    type: "operation" as const,
    id: brandOpaqueResourceIdForPrefix("op", operationId),
  };
}

async function writeChallengeAuditEvent(
  event: AuditEventInput,
  auditEventId?: AuditEventId,
): Promise<{ auditEventId: string }> {
  if (auditEventId !== undefined) {
    const result = await writeAuditEventWithId(event, auditEventId);
    return { auditEventId: result.auditEventId };
  }

  const result = await writeAuditEvent(event);
  return { auditEventId: result.auditEventId };
}

function buildChallengeRequestActorSuccessAuditEvent(
  eventCode: AuditEventInput["eventCode"],
  input: ChallengeAuditScope & {
    requestingUserId?: UserId;
    requestingMachineIdentityId?: MachineIdentityId;
    challengeId: string;
    riskReasonCode: string;
    clearingUserId?: UserId;
  },
): AuditEventInput {
  return {
    eventCode,
    outcome: "success",
    actor: challengeRequestActor(input),
    ...scopedAuditFields(input),
    resource: operationResource(input.operationId),
    details: challengeAuditDetails(input),
  };
}

export async function recordHighAssuranceChallengeRequested(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
  challengeId: string;
  riskReasonCode: string;
  auditEventId?: AuditEventId;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  return writeChallengeAuditEvent(
    buildChallengeRequestActorSuccessAuditEvent(
      PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequested,
      input,
    ),
    input.auditEventId,
  );
}

export async function recordHighAssuranceChallengeRequestDenied(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
  reasonCode: KnownErrorCode;
  riskReasonCode: string;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequestDenied,
    outcome: "denied",
    actor: challengeRequestActor(input),
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
  requestingMachineIdentityId?: MachineIdentityId;
  challengeId: string;
  riskReasonCode: string;
  clearAuthenticationMethodCode: string;
  auditEventId?: AuditEventId;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  const event = {
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeCleared,
    outcome: "success" as const,
    actor: { type: "user" as const, userId: input.clearingUserId },
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
  };

  return writeChallengeAuditEvent(event, input.auditEventId);
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
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
  clearingUserId: UserId;
  challengeId: string;
  riskReasonCode: string;
  auditEventId?: AuditEventId;
  request?: { requestId: RequestId };
}): Promise<{ auditEventId: string }> {
  return writeChallengeAuditEvent(
    buildChallengeRequestActorSuccessAuditEvent(
      PRODUCTION_AUDIT_EVENT_CODES.highAssuranceEvidenceConsumed,
      input,
    ),
    input.auditEventId,
  );
}

export async function recordHighAssuranceEvidenceConsumeDenied(input: {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  reasonCode: KnownErrorCode;
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
  request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceEvidenceConsumeDenied,
    outcome: "denied",
    actor: challengeRequestActor(input),
    ...scopedAuditFields(input),
    denial: { reasonCode: input.reasonCode },
  });
}
