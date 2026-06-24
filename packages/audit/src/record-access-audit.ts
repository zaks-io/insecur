import { AUTH_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "./audit-event-codes.js";
import { recordActionAudit } from "./record-action-audit.js";
import type {
  AuditEventActorRef,
  AuditOperationRef,
  AuditRequestRef,
  AuditResourceRef,
} from "./audit-types.js";
import type { AuditEventResult } from "./write-audit-event.js";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

export interface RecordAccessDeniedAuditInput {
  actor: AuditEventActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

/**
 * Records a metadata-only `access.denied` audit event for authorization failures.
 */
export async function recordAccessDeniedAudit(
  input: RecordAccessDeniedAuditInput,
): Promise<AuditEventResult> {
  return recordActionAudit({
    outcome: "denied",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
    actor: input.actor,
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    reasonCode: input.reasonCode ?? AUTH_ERROR_CODES.insufficientScope,
  });
}
