import { decryptProviderCredentialForProviderUse, type Keyring } from "@insecur/crypto";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";
import type {
  OrganizationId,
  WebhookSigningSecretId,
  WebhookSubscriptionId,
} from "@insecur/domain";

import { webhookSigningSecretCredentialIdentity } from "./webhook-signing-secret-credential-identity.js";

export async function decryptWebhookSigningSecret(
  keyring: Keyring,
  input: {
    readonly organizationId: OrganizationId;
    readonly subscriptionId: WebhookSubscriptionId;
    readonly signingSecretId: WebhookSigningSecretId;
    readonly wrapped: WrappedProviderCredential;
  },
): Promise<Uint8Array> {
  const identity = webhookSigningSecretCredentialIdentity(input);
  const handle = await decryptProviderCredentialForProviderUse(keyring, identity, input.wrapped);
  return handle.unwrapUtf8();
}
