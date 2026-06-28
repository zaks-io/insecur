import {
  parseOpaqueResourceId,
  type EnvironmentId,
  type InjectionGrantId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type SecretVersionId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { FIRST_VALUE_AUDIT_EVENT_CODES, type AuditEventCode } from "./audit-event-codes.js";
import { omitUndefinedFields } from "./optional-audit-fields.js";
import {
  recordScopedAudit,
  recordScopedAuditInTenantScope,
  type RecordScopedAuditInput,
} from "./record-scoped-audit.js";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "./audit-types.js";
import type { AuditEventResult } from "./write-audit-event.js";

export type RuntimeInjectionAuditPhase = "issue" | "consume" | "run";

export interface RecordRuntimeInjectionAuditInput {
  phase: RuntimeInjectionAuditPhase;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  grantId?: InjectionGrantId;
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

function eventCodeFor(input: RecordRuntimeInjectionAuditInput): AuditEventCode {
  if (input.phase === "issue") {
    return input.outcome === "success"
      ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued
      : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssueDenied;
  }
  if (input.phase === "consume") {
    return input.outcome === "success"
      ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumed
      : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantConsumeDenied;
  }
  return input.outcome === "success"
    ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted
    : FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunDenied;
}

function toRuntimeInjectionScopedInput(
  input: RecordRuntimeInjectionAuditInput,
): RecordScopedAuditInput {
  const grantResource =
    input.grantId !== undefined ? injectionGrantAuditResource(input.grantId) : {};
  const versionResource =
    input.deliveredSecretVersionId !== undefined
      ? secretVersionAuditRelatedResource(input.deliveredSecretVersionId)
      : {};

  return {
    eventCode: eventCodeFor(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    ...omitUndefinedFields({
      projectId: input.projectId,
      environmentId: input.environmentId,
      resource: grantResource.resource,
      relatedResource: versionResource.relatedResource,
      requestId: input.request?.requestId,
      operationId: input.operation?.operationId,
      reasonCode: input.reasonCode,
    }),
  };
}

/**
 * Records metadata-only Runtime Injection grant and run audit events.
 */
export async function recordRuntimeInjectionAudit(
  input: RecordRuntimeInjectionAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordScopedAudit(toRuntimeInjectionScopedInput(input));
}

export async function recordRuntimeInjectionAuditInTenantScope(
  sql: TenantScopedSql,
  input: RecordRuntimeInjectionAuditInput,
): Promise<AuditEventResult> {
  return recordScopedAuditInTenantScope(sql, toRuntimeInjectionScopedInput(input));
}
