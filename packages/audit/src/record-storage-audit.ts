import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "./audit-event-codes.js";
import { actionAuditScopeFields, recordActionAudit } from "./record-action-audit.js";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "./audit-types.js";
import type { AuditEventResult } from "./write-audit-event.js";

export interface RecordStorageAuditInput {
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId?: SecretId;
  secretVersionId?: SecretVersionId;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

/**
 * Records metadata-only secret storage write audit events (non-protected path).
 */
export async function recordStorageAudit(
  input: RecordStorageAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordActionAudit({
    ...actionAuditScopeFields({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      ...(input.request !== undefined ? { request: input.request } : {}),
      ...(input.operation !== undefined ? { operation: input.operation } : {}),
      ...(input.secretId !== undefined
        ? {
            resource: {
              type: "secret",
              id: brandOpaqueResourceIdForPrefix("sec", input.secretId),
            },
          }
        : {}),
      ...(input.secretVersionId !== undefined
        ? {
            relatedResource: {
              type: "secret_version",
              id: brandOpaqueResourceIdForPrefix("sv", input.secretVersionId),
            },
          }
        : {}),
    }),
    outcome: input.outcome,
    eventCode:
      input.outcome === "success"
        ? FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite
        : FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
  });
}
