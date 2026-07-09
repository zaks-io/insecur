import {
  PRODUCTION_AUDIT_EVENT_CODES,
  setAuditNotificationEmitter,
  type AuditEventInput,
} from "@insecur/audit";
import type { Keyring } from "@insecur/crypto";
import type { ApprovalRequestId } from "@insecur/domain";

import type { ApprovalDeliveryPorts } from "./approval-delivery-ports.js";
import type { DeliveryPorts } from "./delivery-ports.js";
import { emitApprovalNotification } from "./emit-approval-notification.js";
import {
  buildEnvelopeFromAuditEvent,
  createInAppDeliveryPort,
  emitEventNotificationsForEnvelope,
} from "./emit-event-notifications.js";
import { resolveEnvelopeDisplayNames } from "./resolve-envelope-display-names.js";

export interface RegisterAuditNotificationEmitterInput {
  readonly keyring: Keyring;
  readonly deliveryPorts?: Partial<DeliveryPorts>;
  /**
   * Alert-only Approval Notification wiring (ADR-0017). When omitted, approval-request-created
   * audits still emit webhook Event Notifications but no approver alert is sent.
   */
  readonly approval?: {
    readonly deliveryPorts: ApprovalDeliveryPorts;
    readonly webBaseUrl: string;
  };
}

/** Returns the created Approval Request id when the event is an approval-request-created success. */
function approvalRequestCreatedId(event: AuditEventInput): ApprovalRequestId | null {
  if (
    event.eventCode === PRODUCTION_AUDIT_EVENT_CODES.approvalRequestCreated &&
    event.outcome === "success" &&
    event.resource?.type === "approval_request"
  ) {
    return event.resource.id as unknown as ApprovalRequestId;
  }
  return null;
}

export function registerAuditNotificationEmitter(
  input: RegisterAuditNotificationEmitterInput,
): void {
  const deliveryPorts: DeliveryPorts = {
    inApp: input.deliveryPorts?.inApp ?? createInAppDeliveryPort(),
    ...(input.deliveryPorts?.email !== undefined ? { email: input.deliveryPorts.email } : {}),
  };

  setAuditNotificationEmitter(async (event) => {
    const displayNames = await resolveEnvelopeDisplayNames(event);
    const envelope = buildEnvelopeFromAuditEvent(event, displayNames);
    await emitEventNotificationsForEnvelope({
      keyring: input.keyring,
      organizationId: event.organizationId,
      eventCode: event.eventCode,
      envelope,
      deliveryPorts,
      sourceAuditEvent: event,
    });

    const approvalRequestId = approvalRequestCreatedId(event);
    if (input.approval !== undefined && approvalRequestId !== null) {
      await emitApprovalNotification({
        organizationId: event.organizationId,
        approvalRequestId,
        createdAt: new Date(),
        auditActor: event.actor,
        webBaseUrl: input.approval.webBaseUrl,
        deliveryPorts: input.approval.deliveryPorts,
      });
    }
  });
}

export function clearAuditNotificationEmitter(): void {
  setAuditNotificationEmitter(null);
}
