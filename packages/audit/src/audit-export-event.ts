import { assertMetadataOnlyValue, FORBIDDEN_ENVELOPE_KEYS } from "@insecur/domain";
import type { AuditEventInsertRow } from "./audit-event-row.js";
import type { AuditExportEventPayload } from "./audit-export-types.js";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toAuditExportEventPayload(
  row: AuditEventInsertRow & { readonly createdAt: Date | string },
): AuditExportEventPayload {
  return {
    id: row.id,
    organization_id: row.orgId,
    event_code: row.eventCode,
    outcome: row.outcome,
    result_code: row.resultCode,
    actor_type: row.actorType,
    actor_user_id: row.actorUserId,
    actor_machine_identity_id: row.actorMachineIdentityId,
    project_id: row.projectId,
    environment_id: row.environmentId,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    related_resource_type: row.relatedResourceType,
    related_resource_id: row.relatedResourceId,
    request_id: row.requestId,
    operation_id: row.operationId,
    details: row.details,
    recorded_at: toIsoString(row.createdAt),
  };
}

export function assertAuditExportPayloadIsMetadataOnly(payload: AuditExportEventPayload): void {
  assertMetadataOnlyValue(payload);
  if (payload.details !== null) {
    assertMetadataOnlyValue(payload.details);
  }
}

function scanObjectForForbiddenSensitiveValues(value: Record<string, unknown>): string | null {
  for (const [key, child] of Object.entries(value)) {
    if ((FORBIDDEN_ENVELOPE_KEYS as readonly string[]).includes(key)) {
      return key;
    }
    const nested = scanAuditExportForForbiddenSensitiveValues(child);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

export function scanAuditExportForForbiddenSensitiveValues(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = scanAuditExportForForbiddenSensitiveValues(item);
      if (nested !== null) {
        return nested;
      }
    }
    return null;
  }
  return scanObjectForForbiddenSensitiveValues(value as Record<string, unknown>);
}
