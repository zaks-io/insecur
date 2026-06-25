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
import { withTenantScope, type TenantScopedSql } from "@insecur/tenant-store";
import { buildAuditExport } from "./build-audit-export.js";
import { toAuditExportEventPayload } from "./audit-export-event.js";
import type { AuditEventCode } from "./audit-event-codes.js";
import type { AuditResourceType } from "./audit-types.js";
import type {
  AuditExportBundle,
  AuditExportEventPayload,
  AuditExportHmacKeyProvider,
  AuditExportSigningKeyProvider,
  AuditExportTimeRange,
} from "./audit-export-types.js";

interface AuditEventRow {
  id: string;
  org_id: string;
  event_code: AuditEventCode;
  outcome: "success" | "denied";
  result_code: KnownErrorCode;
  actor_type: string;
  actor_user_id: string | null;
  project_id: string | null;
  environment_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  related_resource_type: string | null;
  related_resource_id: string | null;
  request_id: string | null;
  operation_id: string | null;
  details: Record<string, string | number | boolean | null> | null;
  created_at: Date;
}

function mapAuditEventRow(row: AuditEventRow): AuditExportEventPayload {
  return toAuditExportEventPayload({
    id: row.id as AuditEventId,
    orgId: row.org_id as OrganizationId,
    eventCode: row.event_code,
    outcome: row.outcome,
    resultCode: row.result_code,
    actorType: "user",
    actorUserId: row.actor_user_id as UserId | null,
    projectId: row.project_id as ProjectId | null,
    environmentId: row.environment_id as EnvironmentId | null,
    resourceType: row.resource_type as AuditResourceType | null,
    resourceId: row.resource_id as OpaqueResourceId | null,
    relatedResourceType: row.related_resource_type as AuditResourceType | null,
    relatedResourceId: row.related_resource_id as OpaqueResourceId | null,
    requestId: row.request_id as RequestId | null,
    operationId: row.operation_id as OperationId | null,
    details: row.details,
    createdAt: row.created_at,
  });
}

async function queryAuditExportEvents(
  sql: TenantScopedSql,
  input: {
    readonly organizationId: OrganizationId;
    readonly timeRange: AuditExportTimeRange;
  },
): Promise<AuditEventRow[]> {
  return sql<AuditEventRow[]>`
        SELECT
          id,
          org_id,
          event_code,
          outcome,
          result_code,
          actor_type,
          actor_user_id,
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
        WHERE org_id = ${input.organizationId}
          AND created_at >= ${input.timeRange.from}::timestamptz
          AND created_at <= ${input.timeRange.to}::timestamptz
        ORDER BY created_at ASC, id ASC
      `;
}

export async function listAuditExportEvents(input: {
  readonly organizationId: OrganizationId;
  readonly timeRange: AuditExportTimeRange;
}): Promise<AuditExportEventPayload[]> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const rows = await queryAuditExportEvents(sql, input);
      return rows.map((row) => mapAuditEventRow(row));
    },
  );
}

export async function exportTenantAuditEvents(input: {
  readonly organizationId: OrganizationId;
  readonly timeRange: AuditExportTimeRange;
  readonly hmacKey: AuditExportHmacKeyProvider;
  readonly signingKey: AuditExportSigningKeyProvider;
}): Promise<AuditExportBundle> {
  const events = await listAuditExportEvents({
    organizationId: input.organizationId,
    timeRange: input.timeRange,
  });
  return buildAuditExport({
    organizationId: input.organizationId,
    events,
    timeRange: input.timeRange,
    hmacKey: input.hmacKey,
    signingKey: input.signingKey,
  });
}
