import type { ActorRef } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import type {
  DisplayName,
  OrganizationId,
  RequestId,
  UserId,
  WebhookSubscriptionId,
} from "@insecur/domain";

export interface CreateWebhookSubscriptionInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly eventCodes: readonly string[];
  readonly deliveryEmail?: string;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
  readonly requestId?: RequestId;
  readonly keyring: Keyring;
  readonly accessActor: ActorRef;
}

export interface WebhookSubscriptionPayload {
  readonly subscriptionId: WebhookSubscriptionId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly status: "active" | "disabled";
  readonly eventCodes: readonly string[];
  readonly deliveryEmail: string | null;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
  readonly signingSecret: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WebhookSubscriptionRead = Omit<WebhookSubscriptionPayload, "signingSecret">;
