import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  type AuditActorRef,
  type AuditEventResult,
  type AuditOperationRef,
  type AuditRequestRef,
  writeAuditEvent,
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
  const base = {
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.secretId !== undefined
      ? {
          resource: {
            type: "secret" as const,
            id: brandOpaqueResourceIdForPrefix("sec", input.secretId),
          },
        }
      : {}),
  };

  if (input.outcome === "success") {
    return writeAuditEvent({
      ...base,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      outcome: "success",
    });
  }

  if (input.reasonCode === undefined) {
    return undefined;
  }

  return writeAuditEvent({
    ...base,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
    outcome: "denied",
    denial: { reasonCode: input.reasonCode },
  });
}
