import type {
  AuditEventId,
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import type {
  AuditActorType,
  AuditEventDetails,
  AuditEventInput,
  AuditResourceType,
} from "./audit-types.js";

export interface AuditEventInsertRow {
  id: AuditEventId;
  orgId: OrganizationId;
  eventCode: AuditEventInput["eventCode"];
  outcome: AuditEventInput["outcome"];
  resultCode: KnownErrorCode;
  actorType: AuditActorType;
  actorUserId: UserId | null;
  actorMachineIdentityId: MachineIdentityId | null;
  projectId: ProjectId | null;
  environmentId: EnvironmentId | null;
  resourceType: AuditResourceType | null;
  resourceId: OpaqueResourceId | null;
  relatedResourceType: AuditResourceType | null;
  relatedResourceId: OpaqueResourceId | null;
  requestId: RequestId | null;
  operationId: OperationId | null;
  details: AuditEventDetails | null;
}

function optionalDetails(event: AuditEventInput): Pick<AuditEventInsertRow, "details"> {
  if (event.details === undefined) {
    return { details: null };
  }
  return { details: event.details };
}

function optionalResource(
  event: AuditEventInput,
): Pick<AuditEventInsertRow, "resourceType" | "resourceId"> {
  if (event.resource === undefined) {
    return { resourceType: null, resourceId: null };
  }
  return { resourceType: event.resource.type, resourceId: event.resource.id };
}

function optionalRelatedResource(
  event: AuditEventInput,
): Pick<AuditEventInsertRow, "relatedResourceType" | "relatedResourceId"> {
  if (event.relatedResource === undefined) {
    return { relatedResourceType: null, relatedResourceId: null };
  }
  return {
    relatedResourceType: event.relatedResource.type,
    relatedResourceId: event.relatedResource.id,
  };
}

function actorIdsFromRef(
  actor: AuditEventInput["actor"],
): Pick<AuditEventInsertRow, "actorUserId" | "actorMachineIdentityId"> {
  switch (actor.type) {
    case "user":
      return { actorUserId: actor.userId, actorMachineIdentityId: null };
    case "machine":
      return { actorUserId: null, actorMachineIdentityId: actor.machineIdentityId };
    case "ci_exchange":
      return { actorUserId: null, actorMachineIdentityId: null };
  }
}

export function toAuditEventInsertRow(
  event: AuditEventInput,
  auditEventId: AuditEventId,
  resultCode: KnownErrorCode,
): AuditEventInsertRow {
  return {
    id: auditEventId,
    orgId: event.organizationId,
    eventCode: event.eventCode,
    outcome: event.outcome,
    resultCode,
    actorType: event.actor.type,
    ...actorIdsFromRef(event.actor),
    projectId: event.projectId ?? null,
    environmentId: event.environmentId ?? null,
    ...optionalResource(event),
    ...optionalRelatedResource(event),
    requestId: event.request?.requestId ?? null,
    operationId: event.operation?.operationId ?? null,
    ...optionalDetails(event),
  };
}
