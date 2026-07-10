import { PRODUCTION_AUDIT_EVENT_CODES } from "./audit-event-codes.js";
import {
  recordActionAudit,
  recordActionAuditInTenantScope,
  type RecordActionAuditInput,
} from "./record-action-audit.js";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "./audit-types.js";
import {
  brandOpaqueResourceIdForPrefix,
  type KnownErrorCode,
  type OrganizationId,
  type OperationId,
} from "@insecur/domain";

export interface RecordOperationCanceledInput {
  readonly actor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly request?: AuditRequestRef;
}

export interface RecordOperationCancelDeniedInput extends RecordOperationCanceledInput {
  readonly reasonCode: KnownErrorCode;
}

function operationAuditScope(input: {
  readonly actor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly request?: AuditRequestRef;
}): Pick<
  RecordActionAuditInput,
  "actor" | "organizationId" | "operation" | "request" | "resource"
> {
  const operation: AuditOperationRef = { operationId: input.operationId };
  return {
    actor: input.actor,
    organizationId: input.organizationId,
    operation,
    resource: { type: "operation", id: brandOpaqueResourceIdForPrefix("op", input.operationId) },
    ...(input.request !== undefined ? { request: input.request } : {}),
  };
}

export async function recordOperationCanceled(
  input: RecordOperationCanceledInput,
): Promise<{ readonly auditEventId: string }> {
  const result = await recordActionAudit({
    ...operationAuditScope(input),
    outcome: "success",
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.operationCanceled,
  });
  return { auditEventId: result.auditEventId };
}

export async function recordOperationCanceledInTenantScope(
  sql: TenantScopedSql,
  input: RecordOperationCanceledInput,
): Promise<{ readonly auditEventId: string }> {
  const result = await recordActionAuditInTenantScope(sql, {
    ...operationAuditScope(input),
    outcome: "success",
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.operationCanceled,
  });
  return { auditEventId: result.auditEventId };
}

export async function recordOperationCancelDenied(
  input: RecordOperationCancelDeniedInput,
): Promise<{ readonly auditEventId: string }> {
  const result = await recordActionAudit({
    ...operationAuditScope(input),
    outcome: "denied",
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.operationCancelDenied,
    reasonCode: input.reasonCode,
  });
  return { auditEventId: result.auditEventId };
}
