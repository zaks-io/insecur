import { encryptProviderCredential, type Keyring } from "@insecur/crypto";
import type {
  OrganizationId,
  WebhookSigningSecretId,
  WebhookSubscriptionId,
} from "@insecur/domain";
import { TenantWebhookSigningSecretStore, withTenantScope } from "@insecur/tenant-store";

import { generateWebhookSigningSecretBytes } from "./event-notification-envelope.js";
import { webhookSigningSecretCredentialIdentity } from "./webhook-signing-secret-credential-identity.js";

export async function mintWebhookSigningSecret(input: {
  readonly keyring: Keyring;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly signingSecretId: WebhookSigningSecretId;
}): Promise<{ readonly plaintext: Uint8Array }> {
  const plaintext = generateWebhookSigningSecretBytes();
  const wrapped = await encryptProviderCredential(
    input.keyring,
    webhookSigningSecretCredentialIdentity(input),
    plaintext,
  );

  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      await new TenantWebhookSigningSecretStore(db).insertSecret({
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        signingSecretId: input.signingSecretId,
        wrapped,
      });
    },
  );

  return { plaintext };
}

export async function rotateWebhookSigningSecret(input: {
  readonly keyring: Keyring;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly previousSigningSecretId: WebhookSigningSecretId;
  readonly newSigningSecretId: WebhookSigningSecretId;
}): Promise<{ readonly plaintext: Uint8Array }> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantWebhookSigningSecretStore(db);
      await store.retireSecret(input.organizationId, input.previousSigningSecretId);
    },
  );
  return mintWebhookSigningSecret({
    keyring: input.keyring,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    signingSecretId: input.newSigningSecretId,
  });
}
