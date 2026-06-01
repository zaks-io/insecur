import type {
  AuditEventId,
  EnvironmentId,
  KnownErrorCode,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import type { AuditActorType, AuditEventInput, AuditResourceType } from "./audit-types.js";

export interface AuditEventInsertRow {
  id: AuditEventId;
  orgId: OrganizationId;
  eventCode: AuditEventInput["eventCode"];
  outcome: AuditEventInput["outcome"];
  resultCode: KnownErrorCode;
  actorType: AuditActorType;
  actorUserId: UserId;
  projectId: ProjectId | null;
  environmentId: EnvironmentId | null;
  resourceType: AuditResourceType | null;
  resourceId: OpaqueResourceId | null;
  requestId: RequestId | null;
  operationId: OperationId | null;
}

function optionalProjectId(event: AuditEventInput): ProjectId | null {
  return event.projectId ?? null;
}

function optionalEnvironmentId(event: AuditEventInput): EnvironmentId | null {
  return event.environmentId ?? null;
}

function optionalResource(
  event: AuditEventInput,
): Pick<AuditEventInsertRow, "resourceType" | "resourceId"> {
  if (event.resource === undefined) {
    return { resourceType: null, resourceId: null };
  }
  return { resourceType: event.resource.type, resourceId: event.resource.id };
}

function optionalRequestId(event: AuditEventInput): RequestId | null {
  return event.request?.requestId ?? null;
}

function optionalOperationId(event: AuditEventInput): OperationId | null {
  return event.operation?.operationId ?? null;
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
    actorUserId: event.actor.userId,
    projectId: optionalProjectId(event),
    environmentId: optionalEnvironmentId(event),
    ...optionalResource(event),
    requestId: optionalRequestId(event),
    operationId: optionalOperationId(event),
  };
}
