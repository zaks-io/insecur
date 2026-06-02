import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  type AuditActorRef,
  type AuditEventResult,
  type AuditOperationRef,
  type AuditRequestRef,
  type FirstValueAuditEventCode,
  writeAuditEvent,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type EnvironmentId,
  type InjectionGrantId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type SecretVersionId,
} from "@insecur/domain";

export type InjectionGrantAuditPhase = "issue" | "consume";

export interface RecordInjectionGrantAuditInput {
  phase: InjectionGrantAuditPhase;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  grantId?: InjectionGrantId;
  /** Metadata-only delivered Secret Version identity (consume success only). */
  deliveredSecretVersionId?: SecretVersionId;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

function eventCodeFor(input: RecordInjectionGrantAuditInput): FirstValueAuditEventCode {
  if (input.phase === "issue") {
    return input.outcome === "success"
      ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued
      : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied;
  }
  return input.outcome === "success"
    ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed
    : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied;
}

function auditBaseForInjectionGrant(input: RecordInjectionGrantAuditInput) {
  return {
    actor: input.actor,
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.grantId !== undefined
      ? {
          resource: {
            type: "injection_grant" as const,
            id: brandOpaqueResourceIdForPrefix("igr", input.grantId),
          },
        }
      : {}),
    ...(input.deliveredSecretVersionId !== undefined
      ? {
          relatedResource: {
            type: "secret_version" as const,
            id: brandOpaqueResourceIdForPrefix("sv", input.deliveredSecretVersionId),
          },
        }
      : {}),
  };
}

export async function recordInjectionGrantAudit(
  input: RecordInjectionGrantAuditInput,
): Promise<AuditEventResult | undefined> {
  const base = auditBaseForInjectionGrant(input);

  if (input.outcome === "success") {
    return writeAuditEvent({
      ...base,
      eventCode: eventCodeFor(input),
      outcome: "success",
    });
  }

  if (input.reasonCode === undefined) {
    return undefined;
  }

  return writeAuditEvent({
    ...base,
    eventCode: eventCodeFor(input),
    outcome: "denied",
    denial: { reasonCode: input.reasonCode },
  });
}
