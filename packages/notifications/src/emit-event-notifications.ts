import type { AuditEventInput } from "@insecur/audit";
import type { Keyring } from "@insecur/crypto";
import {
  inAppEventNotificationId,
  NOTIFICATION_ERROR_CODES,
  type OrganizationId,
  type WebhookSubscriptionId,
} from "@insecur/domain";
import {
  TenantInAppEventNotificationStore,
  TenantWebhookSigningSecretStore,
  TenantWebhookSubscriptionStore,
  withTenantScope,
  type WebhookSubscriptionRow,
} from "@insecur/tenant-store";

import { decryptWebhookSigningSecret } from "./decrypt-webhook-signing-secret.js";
import type { DeliveryPorts } from "./delivery-ports.js";
import {
  signEventNotificationEnvelope,
  type EventNotificationEnvelope,
  type SignedEventNotification,
} from "./event-notification-envelope.js";
import {
  recordWebhookDeliveryFailed,
  recordWebhookDeliverySucceeded,
} from "./record-webhook-audit.js";

export interface EmitEventNotificationsInput {
  readonly keyring: Keyring;
  readonly organizationId: OrganizationId;
  readonly eventCode: string;
  readonly envelope: EventNotificationEnvelope;
  readonly deliveryPorts: DeliveryPorts;
  readonly sourceAuditEvent: AuditEventInput;
}

export async function emitEventNotificationsForEnvelope(
  input: EmitEventNotificationsInput,
): Promise<void> {
  const subscriptions = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      new TenantWebhookSubscriptionStore(db).listActiveByEventCode(
        input.organizationId,
        input.eventCode,
      ),
  );

  for (const subscription of subscriptions) {
    try {
      await deliverToSubscription(input, subscription);
      await recordDeliveryAudit(input.sourceAuditEvent, subscription.subscriptionId, "success");
    } catch {
      await recordDeliveryAudit(input.sourceAuditEvent, subscription.subscriptionId, "failed");
    }
  }
}

async function deliverToSubscription(
  input: EmitEventNotificationsInput,
  subscription: WebhookSubscriptionRow,
): Promise<void> {
  const signingSecretRow = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      new TenantWebhookSigningSecretStore(db).getActiveSecret(
        input.organizationId,
        subscription.subscriptionId,
      ),
  );
  if (!signingSecretRow) {
    throw new Error("webhook signing secret missing");
  }

  const secretBytes = await decryptWebhookSigningSecret(input.keyring, {
    organizationId: input.organizationId,
    subscriptionId: subscription.subscriptionId,
    signingSecretId: signingSecretRow.id,
    wrapped: signingSecretRow.wrapped,
  });
  const signed = await signEventNotificationEnvelope(input.envelope, secretBytes, new Date());
  await deliverSignedNotification(input, subscription, signed);
}

async function deliverSignedNotification(
  input: EmitEventNotificationsInput,
  subscription: WebhookSubscriptionRow,
  signed: SignedEventNotification,
): Promise<void> {
  if (subscription.enableInAppChannel) {
    await input.deliveryPorts.inApp.persistEventNotification({
      organizationId: input.organizationId,
      subscriptionId: subscription.subscriptionId,
      signed,
    });
  }
  if (subscription.enableEmailChannel && subscription.deliveryEmail && input.deliveryPorts.email) {
    await input.deliveryPorts.email.sendEventNotification({
      toEmail: subscription.deliveryEmail,
      signed,
    });
  }
}

async function recordDeliveryAudit(
  sourceEvent: AuditEventInput,
  subscriptionId: WebhookSubscriptionId,
  outcome: "success" | "failed",
): Promise<void> {
  if (sourceEvent.actor.type !== "user" || sourceEvent.actor.userId === null) {
    return;
  }
  const actorUserId = sourceEvent.actor.userId;
  if (outcome === "success") {
    await recordWebhookDeliverySucceeded({
      actorUserId,
      organizationId: sourceEvent.organizationId,
      subscriptionId,
    });
    return;
  }
  await recordWebhookDeliveryFailed({
    actorUserId,
    organizationId: sourceEvent.organizationId,
    subscriptionId,
    reasonCode: NOTIFICATION_ERROR_CODES.deliveryFailed,
  });
}

export function buildEnvelopeFromAuditEvent(
  event: AuditEventInput,
  displayNames: Readonly<Record<string, string>>,
): EventNotificationEnvelope {
  const actor =
    event.actor.type === "user"
      ? { type: "user" as const, id: event.actor.userId ?? "unknown" }
      : event.actor.type === "machine"
        ? { type: "machine" as const, id: event.actor.machineIdentityId }
        : { type: "machine" as const, id: "ci_exchange" };

  const envelope: EventNotificationEnvelope = {
    eventCode: event.eventCode,
    timestamp: new Date().toISOString(),
    organizationId: event.organizationId,
    displayNames,
    actor,
    status: event.outcome === "success" ? "success" : "denied",
  };
  if (event.resource !== undefined) {
    return { ...envelope, resource: { type: event.resource.type, id: event.resource.id } };
  }
  if (event.outcome === "denied") {
    return { ...envelope, resultCode: event.denial.reasonCode };
  }
  return envelope;
}

export function createInAppDeliveryPort(): DeliveryPorts["inApp"] {
  return {
    async persistEventNotification(input) {
      await withTenantScope(
        { kind: "organization", organizationId: input.organizationId as OrganizationId },
        async ({ db }) => {
          await new TenantInAppEventNotificationStore(db).insert({
            organizationId: input.organizationId as OrganizationId,
            notificationId: inAppEventNotificationId.generate(),
            subscriptionId: input.subscriptionId as WebhookSubscriptionId,
            webhookEventCode: input.signed.envelope.eventCode,
            envelopePayload: JSON.stringify(input.signed.envelope),
            signature: input.signed.signature,
            signatureTimestamp: new Date(input.signed.signatureTimestamp),
          });
        },
      );
    },
  };
}
