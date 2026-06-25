import { bindJsonb, type TenantScopedSql } from "@insecur/tenant-store";
import { toAuditEventInsertRow, type AuditEventInsertRow } from "./audit-event-row.js";
import type { AuditEventInput } from "./audit-types.js";
import type { AuditEventId, KnownErrorCode } from "@insecur/domain";

async function insertRow(sql: TenantScopedSql, row: AuditEventInsertRow): Promise<void> {
  const detailsValue = row.details === null ? null : bindJsonb(sql, row.details);

  await sql`
    INSERT INTO audit_events (
      id,
      org_id,
      event_code,
      outcome,
      result_code,
      actor_type,
      actor_user_id,
      actor_machine_identity_id,
      project_id,
      environment_id,
      resource_type,
      resource_id,
      related_resource_type,
      related_resource_id,
      request_id,
      operation_id,
      details
    ) VALUES (
      ${row.id},
      ${row.orgId},
      ${row.eventCode},
      ${row.outcome},
      ${row.resultCode},
      ${row.actorType},
      ${row.actorUserId},
      ${row.actorMachineIdentityId},
      ${row.projectId},
      ${row.environmentId},
      ${row.resourceType},
      ${row.resourceId},
      ${row.relatedResourceType},
      ${row.relatedResourceId},
      ${row.requestId},
      ${row.operationId},
      ${detailsValue}
    )
  `;
}

export async function insertAuditEventRow(
  sql: TenantScopedSql,
  auditEventId: AuditEventId,
  event: AuditEventInput,
  resultCode: KnownErrorCode,
): Promise<void> {
  await insertRow(sql, toAuditEventInsertRow(event, auditEventId, resultCode));
}
