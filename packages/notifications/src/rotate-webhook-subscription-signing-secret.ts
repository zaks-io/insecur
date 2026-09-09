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
import { prepareWebhookSigningSecret } from "./webhook-signing-secret-lifecycle.js";
import {
  assertWebhookManageAccess,
  buildWebhookSubscriptionAuditScope,
} from "./webhook-subscription-shared.js";

interface RotateWebhookSubscriptionSigningSecretInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly keyring: Keyring;
  readonly accessActor: ActorRef;
  readonly requestId?: RequestId;
}

function signingSecretMissingError() {
  return Object.assign(new Error("Signing secret missing."), {
    code: NOTIFICATION_ERROR_CODES.signingSecretMissing,
  });
}

async function readActiveSigningSecret(input: RotateWebhookSubscriptionSigningSecretInput) {
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
    throw signingSecretMissingError();
  }
  return activeSecret;
}

async function replaceActiveSigningSecret(
  input: RotateWebhookSubscriptionSigningSecretInput,
  activeSecret: Awaited<ReturnType<typeof readActiveSigningSecret>>,
  replacement: Awaited<ReturnType<typeof prepareWebhookSigningSecret>> & {
    signingSecretId: ReturnType<typeof webhookSigningSecretId.generate>;
  },
): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantWebhookSigningSecretStore(db);
      const retired = await store.retireActiveSecret(
        input.organizationId,
        input.subscriptionId,
        activeSecret.id,
      );
      if (!retired) {
        throw signingSecretMissingError();
      }
      await store.insertSecret({
        organizationId: input.organizationId,
        subscriptionId: input.subscriptionId,
        signingSecretId: replacement.signingSecretId,
        wrapped: replacement.wrapped,
      });
    },
  );
}

export async function rotateWebhookSubscriptionSigningSecret(
  input: RotateWebhookSubscriptionSigningSecretInput,
): Promise<{ readonly signingSecret: string }> {
  await assertWebhookManageAccess(input.accessActor, input.organizationId);
  const activeSecret = await readActiveSigningSecret(input);
  const signingSecretId = webhookSigningSecretId.generate();
  const prepared = await prepareWebhookSigningSecret({
    keyring: input.keyring,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    signingSecretId,
  });
  await replaceActiveSigningSecret(input, activeSecret, { ...prepared, signingSecretId });
  await recordWebhookSubscriptionUpdated(buildWebhookSubscriptionAuditScope(input));
  return { signingSecret: bytesToBase64Url(prepared.plaintext) };
}
