import type {
  EnvironmentId,
  KnownErrorCode,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";
import { PRODUCTION_AUDIT_EVENT_CODES } from "./audit-event-codes.js";
import { omitUndefinedFields } from "./optional-audit-fields.js";
import { recordScopedAudit } from "./record-scoped-audit.js";
import type { AuditActorRef, AuditResourceRef } from "./audit-types.js";
import type { AuditEventResult } from "./write-audit-event.js";

export type SyncAuditPhase = "execution" | "revalidation";

export interface RecordSyncAuditInput {
  phase: SyncAuditPhase;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resource?: AuditResourceRef;
  requestId?: RequestId;
  operationId?: OperationId;
  reasonCode?: KnownErrorCode;
}

export type KeyCustodyAuditAction = "data_key_ready" | "key_rotation_planned";

export interface RecordKeyCustodyAuditInput {
  action: KeyCustodyAuditAction;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  resource?: AuditResourceRef;
  requestId?: RequestId;
  reasonCode?: KnownErrorCode;
}

export type ApprovalAuditAction = "request_created" | "request_approved" | "request_rejected";

export interface RecordApprovalAuditInput {
  action: ApprovalAuditAction;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  resource?: AuditResourceRef;
  requestId?: RequestId;
  reasonCode?: KnownErrorCode;
}

function syncEventCode(input: RecordSyncAuditInput) {
  if (input.phase === "revalidation") {
    return PRODUCTION_AUDIT_EVENT_CODES.syncRevalidationDenied;
  }
  return input.outcome === "success"
    ? PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted
    : PRODUCTION_AUDIT_EVENT_CODES.syncExecutionDenied;
}

function keyCustodyEventCode(input: RecordKeyCustodyAuditInput) {
  if (input.action === "data_key_ready") {
    return input.outcome === "success"
      ? PRODUCTION_AUDIT_EVENT_CODES.cryptoDataKeyReady
      : PRODUCTION_AUDIT_EVENT_CODES.cryptoDataKeyDenied;
  }
  return input.outcome === "success"
    ? PRODUCTION_AUDIT_EVENT_CODES.cryptoKeyRotationPlanned
    : PRODUCTION_AUDIT_EVENT_CODES.cryptoKeyRotationDenied;
}

function approvalEventCode(input: RecordApprovalAuditInput) {
  if (input.outcome === "denied") {
    return PRODUCTION_AUDIT_EVENT_CODES.approvalActionDenied;
  }
  switch (input.action) {
    case "request_created":
      return PRODUCTION_AUDIT_EVENT_CODES.approvalRequestCreated;
    case "request_approved":
      return PRODUCTION_AUDIT_EVENT_CODES.approvalRequestApproved;
    case "request_rejected":
      return PRODUCTION_AUDIT_EVENT_CODES.approvalRequestRejected;
  }
}

/** Records metadata-only Secret Sync execution or revalidation audit events. */
export async function recordSyncAudit(
  input: RecordSyncAuditInput,
): Promise<AuditEventResult | undefined> {
  if (input.phase === "revalidation" && input.outcome === "success") {
    return undefined;
  }

  return recordScopedAudit({
    eventCode: syncEventCode(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...omitUndefinedFields({
      resource: input.resource,
      requestId: input.requestId,
      operationId: input.operationId,
      reasonCode: input.reasonCode,
    }),
  });
}

/** Records metadata-only key custody audit events. */
export async function recordKeyCustodyAudit(
  input: RecordKeyCustodyAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordScopedAudit({
    eventCode: keyCustodyEventCode(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    ...omitUndefinedFields({
      projectId: input.projectId,
      resource: input.resource,
      requestId: input.requestId,
      reasonCode: input.reasonCode,
    }),
  });
}

/** Records metadata-only protected approval workflow audit events. */
export async function recordApprovalAudit(
  input: RecordApprovalAuditInput,
): Promise<AuditEventResult | undefined> {
  return recordScopedAudit({
    eventCode: approvalEventCode(input),
    outcome: input.outcome,
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...omitUndefinedFields({
      resource: input.resource,
      requestId: input.requestId,
      reasonCode: input.reasonCode,
    }),
  });
}
