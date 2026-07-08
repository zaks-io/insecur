import type { WrappedProviderCredential } from "@insecur/custody-contracts";
import type {
  OrganizationId,
  WebhookSigningSecretId,
  WebhookSubscriptionId,
} from "@insecur/domain";

export type WebhookSigningSecretStatus = "active" | "retired";

export interface WebhookSigningSecretRow {
  readonly id: WebhookSigningSecretId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly status: WebhookSigningSecretStatus;
  readonly retiredAt: Date | null;
  readonly wrapped: WrappedProviderCredential;
}

export interface UpsertWebhookSigningSecretInput {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly signingSecretId: WebhookSigningSecretId;
  readonly wrapped: WrappedProviderCredential;
}
