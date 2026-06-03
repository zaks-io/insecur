import type {
  EnvironmentId,
  KnownErrorCode,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import type { AuditEventCode } from "./audit-event-codes.js";
import { auditCorrelationRefs } from "./audit-correlation.js";
import { omitUndefinedFields } from "./optional-audit-fields.js";
import { actionAuditScopeFields, recordActionAudit } from "./record-action-audit.js";
import type { AuditActorRef, AuditResourceRef } from "./audit-types.js";
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
    ...omitUndefinedFields({ reasonCode: input.reasonCode }),
  };
}

/** Records a tenant-scoped audit event with optional correlation identifiers. */
export async function recordScopedAudit(input: RecordScopedAuditInput): Promise<AuditEventResult> {
  return recordActionAudit(toRecordActionAuditInput(input));
}
