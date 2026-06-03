import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordActionAudit,
  type AuditActorRef,
  type AuditEventResult,
  type AuditOperationRef,
  type AuditRequestRef,
  type FirstValueAuditEventCode,
} from "@insecur/audit";
import {
  parseOpaqueResourceId,
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

function injectionGrantAuditResource(grantId: InjectionGrantId) {
  const parsed = parseOpaqueResourceId(grantId, "igr");
  if (!parsed.ok) {
    return {};
  }
  return {
    resource: {
      type: "injection_grant" as const,
      id: parsed.value,
    },
  };
}

function secretVersionAuditRelatedResource(secretVersionId: SecretVersionId) {
  const parsed = parseOpaqueResourceId(secretVersionId, "sv");
  if (!parsed.ok) {
    return {};
  }
  return {
    relatedResource: {
      type: "secret_version" as const,
      id: parsed.value,
    },
  };
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
    ...(input.grantId !== undefined ? injectionGrantAuditResource(input.grantId) : {}),
    ...(input.deliveredSecretVersionId !== undefined
      ? secretVersionAuditRelatedResource(input.deliveredSecretVersionId)
      : {}),
  };
}

export async function recordInjectionGrantAudit(
  input: RecordInjectionGrantAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordActionAudit({
    ...auditBaseForInjectionGrant(input),
    outcome: input.outcome,
    eventCode: eventCodeFor(input),
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
  });
}
