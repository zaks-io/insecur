import { encryptProviderCredential, type Keyring } from "@insecur/crypto";
import type {
  OrganizationId,
  WebhookSigningSecretId,
  WebhookSubscriptionId,
} from "@insecur/domain";

import { generateWebhookSigningSecretBytes } from "./event-notification-envelope.js";
import { webhookSigningSecretCredentialIdentity } from "./webhook-signing-secret-credential-identity.js";

export async function prepareWebhookSigningSecret(input: {
  readonly keyring: Keyring;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly signingSecretId: WebhookSigningSecretId;
}) {
  const plaintext = generateWebhookSigningSecretBytes();
  const wrapped = await encryptProviderCredential(
    input.keyring,
    webhookSigningSecretCredentialIdentity(input),
    plaintext,
  );

  return { plaintext, wrapped };
}
