import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { AuditEventCode } from "./audit-event-codes.js";
import type { AuditEventsCursor } from "./query-tenant-audit-events-cursor.js";
import type { AuditEventQueryRow } from "./query-tenant-audit-events-row.js";

export interface ResolvedQueryTenantAuditEventsFilters {
  readonly actorUserId?: string;
  readonly actorMachineIdentityId?: string;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly eventCode?: AuditEventCode;
  readonly createdAtFrom?: string;
  readonly createdAtTo?: string;
}

function nullableFilterValue<T>(value: T | undefined): T | null {
  return value ?? null;
}

function cursorBounds(cursor: AuditEventsCursor | null): {
  readonly hasCursor: boolean;
  readonly createdAt: string | null;
  readonly id: string | null;
} {
  if (cursor === null) {
    return { hasCursor: false, createdAt: null, id: null };
  }
  return { hasCursor: true, createdAt: cursor.createdAt, id: cursor.id };
}

export async function queryAuditEventRows(
  sql: TenantScopedSql,
  input: {
    readonly organizationId: OrganizationId;
    readonly filters: ResolvedQueryTenantAuditEventsFilters;
    readonly pageSize: number;
    readonly cursor: AuditEventsCursor | null;
  },
): Promise<AuditEventQueryRow[]> {
  const { organizationId, filters, pageSize, cursor } = input;
  const bounds = cursorBounds(cursor);

  return sql<AuditEventQueryRow[]>`
    SELECT
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
      details,
      created_at
    FROM audit_events
    WHERE org_id = ${organizationId}
      AND (${nullableFilterValue(filters.actorUserId)}::text IS NULL OR actor_user_id = ${nullableFilterValue(filters.actorUserId)})
      AND (${nullableFilterValue(filters.actorMachineIdentityId)}::text IS NULL OR actor_machine_identity_id = ${nullableFilterValue(filters.actorMachineIdentityId)})
      AND (${nullableFilterValue(filters.projectId)}::text IS NULL OR project_id = ${nullableFilterValue(filters.projectId)})
      AND (${nullableFilterValue(filters.environmentId)}::text IS NULL OR environment_id = ${nullableFilterValue(filters.environmentId)})
      AND (${nullableFilterValue(filters.eventCode)}::text IS NULL OR event_code = ${nullableFilterValue(filters.eventCode)})
      AND (${nullableFilterValue(filters.createdAtFrom)}::text IS NULL OR created_at >= ${nullableFilterValue(filters.createdAtFrom)}::timestamptz)
      AND (${nullableFilterValue(filters.createdAtTo)}::text IS NULL OR created_at <= ${nullableFilterValue(filters.createdAtTo)}::timestamptz)
      AND (
        ${!bounds.hasCursor}
        OR created_at < ${bounds.createdAt}::timestamptz
        OR (created_at = ${bounds.createdAt}::timestamptz AND id < ${bounds.id})
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ${pageSize + 1}
  `;
}
