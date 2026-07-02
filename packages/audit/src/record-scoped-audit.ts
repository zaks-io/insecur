import type {
  EnvironmentId,
  KnownErrorCode,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { AuditEventCode } from "./audit-event-codes.js";
import { auditCorrelationRefs } from "./audit-correlation.js";
import { omitUndefinedFields } from "./optional-audit-fields.js";
import {
  actionAuditScopeFields,
  recordActionAudit,
  recordActionAuditInTenantScope,
} from "./record-action-audit.js";
import type { AuditActorRef, AuditEventDetails, AuditResourceRef } from "./audit-types.js";
import type { AuditEventResult } from "./write-audit-event.js";

export interface RecordScopedAuditInput {
  eventCode: AuditEventCode;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  relatedResource?: AuditResourceRef;
  requestId?: RequestId;
  operationId?: OperationId;
  reasonCode?: KnownErrorCode;
  details?: AuditEventDetails;
}

function toRecordActionAuditInput(input: RecordScopedAuditInput) {
  const correlation = auditCorrelationRefs(
    omitUndefinedFields({
      requestId: input.requestId,
      operationId: input.operationId,
    }),
  );

  return {
    ...actionAuditScopeFields({
      actor: input.actor,
      organizationId: input.organizationId,
      ...omitUndefinedFields({
        projectId: input.projectId,
        environmentId: input.environmentId,
        resource: input.resource,
        relatedResource: input.relatedResource,
        request: correlation.request,
        operation: correlation.operation,
      }),
    }),
    outcome: input.outcome,
    eventCode: input.eventCode,
    ...omitUndefinedFields({
      reasonCode: input.reasonCode,
      details: input.details,
    }),
  };
}

/** Records a tenant-scoped audit event with optional correlation identifiers. */
export async function recordScopedAudit(input: RecordScopedAuditInput): Promise<AuditEventResult> {
  return recordActionAudit(toRecordActionAuditInput(input));
}

export async function recordScopedAuditInTenantScope(
  sql: TenantScopedSql,
  input: RecordScopedAuditInput,
): Promise<AuditEventResult> {
  return recordActionAuditInTenantScope(sql, toRecordActionAuditInput(input));
}
