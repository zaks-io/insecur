import type {
  AuditEventId,
  EnvironmentId,
  MachineIdentityId,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import { toIsoTimestamp } from "@insecur/tenant-store";
import type { AuditEventStoreRow } from "./audit-event-store-row.js";
import type { AuditEventRead } from "./audit-event-read.js";
import type { AuditActorType, AuditResourceType } from "./audit-types.js";

export type AuditEventQueryRow = AuditEventStoreRow;

function optionalResource(type: string | null, id: string | null): AuditEventRead["resource"] {
  if (type === null || id === null) {
    return null;
  }
  return { type: type as AuditResourceType, id: id as OpaqueResourceId };
}

function toActorRead(row: AuditEventStoreRow): AuditEventRead["actor"] {
  const actorType = row.actor_type as AuditActorType;
  switch (actorType) {
    case "user":
      return row.actor_user_id === null
        ? { actorType }
        : { actorType, userId: row.actor_user_id as UserId };
    case "machine":
      return row.actor_machine_identity_id === null
        ? { actorType }
        : { actorType, machineIdentityId: row.actor_machine_identity_id as MachineIdentityId };
    case "ci_exchange":
      return { actorType };
  }
}

export function toAuditEventReadFromRow(row: AuditEventStoreRow): AuditEventRead {
  return {
    auditEventId: row.id as AuditEventId,
    organizationId: row.org_id as OrganizationId,
    eventCode: row.event_code,
    outcome: row.outcome,
    resultCode: row.result_code,
    actor: toActorRead(row),
    projectId: row.project_id as ProjectId | null,
    environmentId: row.environment_id as EnvironmentId | null,
    resource: optionalResource(row.resource_type, row.resource_id),
    relatedResource: optionalResource(row.related_resource_type, row.related_resource_id),
    requestId: row.request_id as RequestId | null,
    operationId: row.operation_id as OperationId | null,
    details: row.details,
    createdAt: toIsoTimestamp(row.created_at),
  };
}
