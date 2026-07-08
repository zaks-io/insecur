import { setAuditNotificationEmitter } from "@insecur/audit";
import type { Keyring } from "@insecur/crypto";

import type { DeliveryPorts } from "./delivery-ports.js";
import {
  buildEnvelopeFromAuditEvent,
  createInAppDeliveryPort,
  emitEventNotificationsForEnvelope,
} from "./emit-event-notifications.js";
import { resolveEnvelopeDisplayNames } from "./resolve-envelope-display-names.js";

export interface RegisterAuditNotificationEmitterInput {
  readonly keyring: Keyring;
  readonly deliveryPorts?: Partial<DeliveryPorts>;
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
  });
}

export function clearAuditNotificationEmitter(): void {
  setAuditNotificationEmitter(null);
}
