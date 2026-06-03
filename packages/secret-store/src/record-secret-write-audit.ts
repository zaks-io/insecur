import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordActionAudit,
  type AuditActorRef,
  type AuditEventResult,
  type AuditOperationRef,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";

export interface RecordSecretWriteAuditInput {
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

export async function recordSecretWriteAudit(
  input: RecordSecretWriteAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordActionAudit({
    outcome: input.outcome,
    eventCode:
      input.outcome === "success"
        ? FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite
        : FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
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
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
  });
}
