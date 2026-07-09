import type { AuditEventActorRef } from "@insecur/audit";
import {
  NOTIFICATION_ERROR_CODES,
  type ApprovalRequestId,
  type KnownErrorCode,
  type OrganizationId,
} from "@insecur/domain";

import type { ApprovalDeliveryPorts } from "./approval-delivery-ports.js";
import {
  assertApprovalNotificationEnvelopeSafe,
  buildApprovalDeepLinkUrl,
  type ApprovalNotificationEnvelope,
} from "./approval-notification-envelope.js";
import {
  recordApprovalNotificationFailed,
  recordApprovalNotificationSent,
} from "./record-approval-notification-audit.js";

export interface EmitApprovalNotificationInput {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly createdAt: Date;
  /** Actor recorded on the notification audit (the requester who created the Approval Request). */
  readonly auditActor: AuditEventActorRef;
  readonly webBaseUrl: string;
  readonly deliveryPorts: ApprovalDeliveryPorts;
}

/**
 * Builds the metadata-safe Approval Notification envelope. The safety assertion runs on every
 * build so no path can construct a payload that carries a forbidden field.
 */
export function buildApprovalNotificationEnvelope(
  input: Pick<
    EmitApprovalNotificationInput,
    "organizationId" | "approvalRequestId" | "createdAt" | "webBaseUrl"
  >,
): ApprovalNotificationEnvelope {
  const envelope: ApprovalNotificationEnvelope = {
    kind: "approval_notification",
    alert: "approval_pending",
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    createdAt: input.createdAt.toISOString(),
    deepLinkUrl: buildApprovalDeepLinkUrl({
      webBaseUrl: input.webBaseUrl,
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    }),
  };
  assertApprovalNotificationEnvelopeSafe(envelope);
  return envelope;
}

function logApprovalNotificationFailure(
  input: Pick<EmitApprovalNotificationInput, "organizationId" | "approvalRequestId">,
  error: unknown,
  context: string,
): void {
  const message = error instanceof Error ? error.message : "unknown approval notification failure";
  console.error(
    `[approval-notification] ${context} for ${input.approvalRequestId} in ${input.organizationId}: ${message}`,
  );
}

async function resolveApproverRecipients(
  input: EmitApprovalNotificationInput,
): Promise<readonly { readonly userId: string; readonly email?: string }[] | null> {
  try {
    return await input.deliveryPorts.recipients.resolveApprovers({
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
    });
  } catch (error) {
    logApprovalNotificationFailure(input, error, "approver resolution failed");
    return null;
  }
}

async function deliverToRecipients(
  input: EmitApprovalNotificationInput,
  envelope: ApprovalNotificationEnvelope,
  recipients: readonly { readonly userId: string; readonly email?: string }[],
): Promise<number> {
  let deliveredCount = 0;
  for (const recipient of recipients) {
    if (await deliverToRecipient(input, envelope, recipient)) {
      deliveredCount += 1;
    }
  }
  return deliveredCount;
}

async function recordSent(
  input: EmitApprovalNotificationInput,
  deliveredCount: number,
): Promise<void> {
  try {
    await recordApprovalNotificationSent({
      actor: input.auditActor,
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
      recipientCount: deliveredCount,
    });
  } catch (error) {
    logApprovalNotificationFailure(input, error, "sent audit write failed");
  }
}

/**
 * Records the delivery outcome: a `.sent` success only when at least one channel actually
 * delivered, otherwise a `.failed` audit. Recording `.sent` with zero deliveries would log a
 * silent notification failure (all channels down, or no approver resolved) as a success.
 */
async function recordDeliveryOutcome(
  input: EmitApprovalNotificationInput,
  deliveredCount: number,
): Promise<void> {
  if (deliveredCount > 0) {
    await recordSent(input, deliveredCount);
    return;
  }
  await recordFailure(input, NOTIFICATION_ERROR_CODES.deliveryFailed);
}

/**
 * Alerts the Organization's approvers over the V1 fallback channels (in-app + email) that an
 * Approval Request needs attention. The payload is metadata-safe (product-spec §10, ADR-0017) and
 * the deep link routes only to the authenticated approval view. Delivery failures are swallowed
 * and audited so an outbound-channel outage never blocks the approval flow.
 */
export async function emitApprovalNotification(
  input: EmitApprovalNotificationInput,
): Promise<void> {
  let envelope: ApprovalNotificationEnvelope;
  try {
    envelope = buildApprovalNotificationEnvelope(input);
  } catch (error) {
    logApprovalNotificationFailure(input, error, "envelope build failed");
    await recordFailure(input, NOTIFICATION_ERROR_CODES.deliveryFailed);
    return;
  }

  const recipients = await resolveApproverRecipients(input);
  if (recipients === null) {
    await recordFailure(input, NOTIFICATION_ERROR_CODES.deliveryFailed);
    return;
  }

  const deliveredCount = await deliverToRecipients(input, envelope, recipients);
  await recordDeliveryOutcome(input, deliveredCount);
}

async function deliverToRecipient(
  input: EmitApprovalNotificationInput,
  envelope: ApprovalNotificationEnvelope,
  recipient: { readonly userId: string; readonly email?: string },
): Promise<boolean> {
  let delivered = false;
  try {
    await input.deliveryPorts.inApp.persistApprovalAlert({
      organizationId: input.organizationId,
      recipientUserId: recipient.userId,
      envelope,
    });
    delivered = true;
  } catch (error) {
    logApprovalNotificationFailure(input, error, "in-app delivery failed");
  }

  if (recipient.email !== undefined && input.deliveryPorts.email !== undefined) {
    try {
      await input.deliveryPorts.email.sendApprovalAlert({ toEmail: recipient.email, envelope });
      delivered = true;
    } catch (error) {
      logApprovalNotificationFailure(input, error, "email delivery failed");
    }
  }

  return delivered;
}

async function recordFailure(
  input: EmitApprovalNotificationInput,
  reasonCode: KnownErrorCode,
): Promise<void> {
  try {
    await recordApprovalNotificationFailed({
      actor: input.auditActor,
      organizationId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
      reasonCode,
    });
  } catch (error) {
    logApprovalNotificationFailure(input, error, "failed audit write failed");
  }
}
