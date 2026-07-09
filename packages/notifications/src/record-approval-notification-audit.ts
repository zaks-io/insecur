import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditEventActorRef,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type ApprovalRequestId,
  type KnownErrorCode,
  type OrganizationId,
} from "@insecur/domain";

function approvalRequestResource(approvalRequestId: ApprovalRequestId) {
  return {
    type: "approval_request" as const,
    id: brandOpaqueResourceIdForPrefix("apr", approvalRequestId),
  };
}

interface ApprovalNotificationAuditScope {
  readonly actor: AuditEventActorRef;
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
}

/**
 * Records a metadata-only `approval_notification.sent` audit. `recipientCount` is a bounded
 * integer, not a Display Name or email, so the audit stays metadata-safe.
 */
export async function recordApprovalNotificationSent(
  input: ApprovalNotificationAuditScope & { readonly recipientCount: number },
): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationSent,
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    resource: approvalRequestResource(input.approvalRequestId),
  });
}

export async function recordApprovalNotificationFailed(
  input: ApprovalNotificationAuditScope & { readonly reasonCode: KnownErrorCode },
): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationFailed,
    outcome: "denied",
    actor: input.actor,
    organizationId: input.organizationId,
    resource: approvalRequestResource(input.approvalRequestId),
    denial: { reasonCode: input.reasonCode },
  });
}
