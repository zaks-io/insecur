import type { SignedEventNotification } from "./event-notification-envelope.js";

export interface EmailDeliveryPort {
  sendEventNotification(input: {
    readonly toEmail: string;
    readonly signed: SignedEventNotification;
  }): Promise<void>;
}

export interface InAppDeliveryPort {
  persistEventNotification(input: {
    readonly organizationId: string;
    readonly subscriptionId: string;
    readonly signed: SignedEventNotification;
  }): Promise<void>;
}

export interface DeliveryPorts {
  readonly email?: EmailDeliveryPort;
  readonly inApp: InAppDeliveryPort;
}
