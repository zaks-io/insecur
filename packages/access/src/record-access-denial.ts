import { AUTH_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  type AuditEventResult,
  writeAuditEvent,
} from "@insecur/audit";
import type {
  AuditActorRef,
  AuditOperationRef,
  AuditRequestRef,
  AuditResourceRef,
} from "@insecur/audit";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

export interface RecordAccessDenialInput {
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

/**
 * Records a metadata-only denied authorization attempt through the Audit Event Writer.
 */
export async function recordAccessDenial(
  input: RecordAccessDenialInput,
): Promise<AuditEventResult> {
  return writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    denial: {
      reasonCode: input.reasonCode ?? AUTH_ERROR_CODES.insufficientScope,
    },
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  });
}
