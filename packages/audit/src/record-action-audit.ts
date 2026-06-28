import {
  AUDIT_ERROR_CODES,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

import type { AuditEventCode } from "./audit-event-codes.js";
import type {
  AuditEventActorRef,
  AuditEventInput,
  AuditOperationRef,
  AuditRequestRef,
  AuditResourceRef,
} from "./audit-types.js";
import {
  type AuditEventResult,
  writeAuditEvent,
  writeAuditEventInTenantScope,
} from "./write-audit-event.js";

export interface RecordActionAuditInput {
  outcome: "success" | "denied";
  eventCode: AuditEventCode;
  actor: AuditEventActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  relatedResource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

export type ActionAuditScopeInput = Pick<
  RecordActionAuditInput,
  | "actor"
  | "organizationId"
  | "projectId"
  | "environmentId"
  | "resource"
  | "relatedResource"
  | "request"
  | "operation"
>;

/** Shared tenant scope, correlation, and resource fields for action audit writers. */
export function actionAuditScopeFields(input: ActionAuditScopeInput) {
  return {
    actor: input.actor,
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.relatedResource !== undefined ? { relatedResource: input.relatedResource } : {}),
  };
}

function toActionAuditEventInput(input: RecordActionAuditInput): AuditEventInput {
  const base = actionAuditScopeFields(input);

  if (input.outcome === "success") {
    return {
      ...base,
      eventCode: input.eventCode,
      outcome: "success",
    };
  }

  const reasonCode = input.reasonCode ?? AUDIT_ERROR_CODES.eventInvalid;

  return {
    ...base,
    eventCode: input.eventCode,
    outcome: "denied",
    denial: { reasonCode },
  };
}

/**
 * Assembles tenant-qualified audit base fields and records a metadata-only
 * success or denied action event through {@link writeAuditEvent}.
 */
export async function recordActionAudit(input: RecordActionAuditInput): Promise<AuditEventResult> {
  return writeAuditEvent(toActionAuditEventInput(input));
}

export async function recordActionAuditInTenantScope(
  sql: TenantScopedSql,
  input: RecordActionAuditInput,
): Promise<AuditEventResult> {
  return writeAuditEventInTenantScope(sql, toActionAuditEventInput(input));
}
