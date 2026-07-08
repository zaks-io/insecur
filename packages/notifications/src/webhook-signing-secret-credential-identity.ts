import type { ProviderCredentialCiphertextIdentity } from "@insecur/crypto";
import {
  brandValue,
  type OrganizationId,
  type WebhookSigningSecretId,
  type WebhookSubscriptionId,
} from "@insecur/domain";

/**
 * Maps webhook signing-secret storage onto the provider-credential ciphertext envelope.
 * The subscription id occupies the `appConnectionId` AAD slot; the signing secret id
 * occupies `credentialId`. Prefixes differ from app-connection credentials by design.
 */
export function webhookSigningSecretCredentialIdentity(input: {
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly signingSecretId: WebhookSigningSecretId;
}): ProviderCredentialCiphertextIdentity {
  return {
    organizationId: input.organizationId,
    appConnectionId: brandValue<string, "AppConnectionId">(input.subscriptionId),
    provider: "webhook-signing-secret",
    credentialId: brandValue<string, "ProviderCredentialId">(input.signingSecretId),
  };
}
