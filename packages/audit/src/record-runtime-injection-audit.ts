import {
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
import {
  injectionGrantAuditResource,
  secretVersionAuditRelatedResource,
} from "./runtime-injection-audit-resources.js";

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
  childExitCode?: number;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
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
  const runDetails =
    input.phase === "run" && input.childExitCode !== undefined
      ? { details: { childExitCode: input.childExitCode } as const }
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
      details: runDetails.details,
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

export type InjectionGrantRevocationVerb = "tenant_suspension" | "compromise_version_invalidation";

export interface RecordInjectionGrantRevocationAuditInput {
  verb: InjectionGrantRevocationVerb;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  revokedGrantCount?: number;
  secretVersionId?: SecretVersionId;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

function revocationEventCodeFor(input: RecordInjectionGrantRevocationAuditInput): AuditEventCode {
  if (input.verb === "tenant_suspension") {
    return input.outcome === "success"
      ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokedTenantSuspension
      : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokeTenantSuspensionDenied;
  }
  return input.outcome === "success"
    ? FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokedCompromiseVersion
    : FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantsRevokeCompromiseVersionDenied;
}

function toRevocationScopedInput(
  input: RecordInjectionGrantRevocationAuditInput,
): RecordScopedAuditInput {
  const versionResource =
    input.secretVersionId !== undefined
      ? secretVersionAuditRelatedResource(input.secretVersionId)
      : {};
  const details =
    input.revokedGrantCount !== undefined
      ? { details: { revokedGrantCount: input.revokedGrantCount } as const }
      : {};

  return {
    eventCode: revocationEventCodeFor(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    ...omitUndefinedFields({
      relatedResource: versionResource.relatedResource,
      requestId: input.request?.requestId,
      operationId: input.operation?.operationId,
      reasonCode: input.reasonCode,
      details: details.details,
    }),
  };
}

export async function recordInjectionGrantRevocationAudit(
  input: RecordInjectionGrantRevocationAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordScopedAudit(toRevocationScopedInput(input));
}

export async function recordInjectionGrantRevocationAuditInTenantScope(
  sql: TenantScopedSql,
  input: RecordInjectionGrantRevocationAuditInput,
): Promise<AuditEventResult> {
  return recordScopedAuditInTenantScope(sql, toRevocationScopedInput(input));
}
