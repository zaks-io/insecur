import type { DisplayName, OrganizationId, WebhookSubscriptionId } from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface WebhookSubscriptionRead {
  readonly subscriptionId: WebhookSubscriptionId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly status: "active" | "disabled";
  readonly eventCodes: readonly string[];
  readonly deliveryEmail: string | null;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWebhookSubscriptionRpcPayload extends WebhookSubscriptionRead {
  readonly signingSecret: string;
}

export interface CreateWebhookSubscriptionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly eventCodes: readonly string[];
  readonly deliveryEmail?: string;
  readonly enableEmailChannel: boolean;
  readonly enableInAppChannel: boolean;
}

export interface ListWebhookSubscriptionsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

export interface ListWebhookSubscriptionsRpcPayload {
  readonly subscriptions: readonly WebhookSubscriptionRead[];
}

export interface UpdateWebhookSubscriptionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly displayName?: DisplayName;
  readonly eventCodes?: readonly string[];
  readonly deliveryEmail?: string | null;
  readonly enableEmailChannel?: boolean;
  readonly enableInAppChannel?: boolean;
  readonly status?: "active" | "disabled";
}

export type UpdateWebhookSubscriptionRpcPayload = WebhookSubscriptionRead;

export interface DeleteWebhookSubscriptionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
}

export interface DeleteWebhookSubscriptionRpcPayload {
  readonly ok: true;
}

export interface RotateWebhookSigningSecretRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
}

export interface RotateWebhookSigningSecretRpcPayload {
  readonly signingSecret: string;
}

export interface ListWebhookEventCodesRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
}

export interface ListWebhookEventCodesRpcPayload {
  readonly eventCodes: readonly string[];
}
