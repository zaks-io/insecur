import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import type {
  AuditEventId,
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import {
  buildChallengeRequestActorSuccessAuditEvent,
  challengeAuditDetails,
  challengeRequestActor,
  operationResource,
  scopedAuditFields,
  writeChallengeAuditEvent,
} from "./challenge-audit-helpers.js";

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

export async function recordHighAssuranceChallengeDenied(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly operationId: OperationId;
  readonly denyingUserId: UserId;
  readonly challengeId: string;
  readonly riskReasonCode: string;
  readonly requestingUserId?: UserId;
  readonly requestingMachineIdentityId?: MachineIdentityId;
  readonly request?: { requestId: RequestId };
}): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeDenied,
    outcome: "success",
    actor: { type: "user", userId: input.denyingUserId },
    ...scopedAuditFields(input),
    resource: operationResource(input.operationId),
    details: challengeAuditDetails({
      challengeId: input.challengeId,
      riskReasonCode: input.riskReasonCode,
      ...(input.requestingUserId !== undefined ? { requestingUserId: input.requestingUserId } : {}),
      ...(input.requestingMachineIdentityId !== undefined
        ? { requestingMachineIdentityId: input.requestingMachineIdentityId }
        : {}),
    }),
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
