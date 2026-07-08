import type { ActorRef } from "@insecur/access";
import type { Keyring } from "@insecur/crypto";
import {
  bytesToBase64Url,
  NOTIFICATION_ERROR_CODES,
  type OrganizationId,
  type RequestId,
  type UserId,
  type WebhookSubscriptionId,
  webhookSigningSecretId,
} from "@insecur/domain";
import {
  TenantWebhookSigningSecretStore,
  TenantWebhookSubscriptionStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { recordWebhookSubscriptionUpdated } from "./record-webhook-audit.js";
import { rotateWebhookSigningSecret } from "./webhook-signing-secret-lifecycle.js";
import {
  assertWebhookManageAccess,
  buildWebhookSubscriptionAuditScope,
} from "./webhook-subscription-shared.js";

export async function rotateWebhookSubscriptionSigningSecret(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly keyring: Keyring;
  readonly accessActor: ActorRef;
  readonly requestId?: RequestId;
}): Promise<{ readonly signingSecret: string }> {
  await assertWebhookManageAccess(input.accessActor, input.organizationId);

  const activeSecret = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const subscription = await new TenantWebhookSubscriptionStore(db).get(
        input.organizationId,
        input.subscriptionId,
      );
      if (!subscription) {
        throw Object.assign(new Error("Subscription not found."), {
          code: NOTIFICATION_ERROR_CODES.subscriptionNotFound,
        });
      }
      return new TenantWebhookSigningSecretStore(db).getActiveSecret(
        input.organizationId,
        input.subscriptionId,
      );
    },
  );
  if (!activeSecret) {
    throw Object.assign(new Error("Signing secret missing."), {
      code: NOTIFICATION_ERROR_CODES.signingSecretMissing,
    });
  }

  const newSigningSecretId = webhookSigningSecretId.generate();
  const { plaintext } = await rotateWebhookSigningSecret({
    keyring: input.keyring,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    previousSigningSecretId: activeSecret.id,
    newSigningSecretId,
  });
  await recordWebhookSubscriptionUpdated(buildWebhookSubscriptionAuditScope(input));
  return { signingSecret: bytesToBase64Url(plaintext) };
}
