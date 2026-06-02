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

function optionalResource(
  event: AuditEventInput,
): Pick<AuditEventInsertRow, "resourceType" | "resourceId"> {
  if (event.resource === undefined) {
    return { resourceType: null, resourceId: null };
  }
  return { resourceType: event.resource.type, resourceId: event.resource.id };
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
    projectId: event.projectId ?? null,
    environmentId: event.environmentId ?? null,
    ...optionalResource(event),
    requestId: event.request?.requestId ?? null,
    operationId: event.operation?.operationId ?? null,
  };
}
