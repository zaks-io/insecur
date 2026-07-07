import type { AuditEventActorRef, AuditEventDetails, AuditEventInput } from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type AuditEventId,
  type EnvironmentId,
  type MachineIdentityId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type UserId,
} from "@insecur/domain";
import { writeAuditEvent, writeAuditEventWithId } from "@insecur/audit";

export function challengeAuditDetails(input: {
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

export interface ChallengeAuditScope {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  operationId: OperationId;
  request?: { requestId: RequestId };
}

export function scopedAuditFields(scope: ChallengeAuditScope) {
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

export function challengeRequestActor(input: {
  requestingUserId?: UserId;
  requestingMachineIdentityId?: MachineIdentityId;
}): AuditEventActorRef {
  if (input.requestingMachineIdentityId !== undefined) {
    return { type: "machine", machineIdentityId: input.requestingMachineIdentityId };
  }
  return userActor(input.requestingUserId);
}

export function operationResource(operationId: OperationId) {
  return {
    type: "operation" as const,
    id: brandOpaqueResourceIdForPrefix("op", operationId),
  };
}

export async function writeChallengeAuditEvent(
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

export function buildChallengeRequestActorSuccessAuditEvent(
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
