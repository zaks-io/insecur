import {
  bytesToBase64Url,
  parseDisplayName,
  webhookSigningSecretId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { TenantWebhookSubscriptionStore, withTenantScope } from "@insecur/tenant-store";

import {
  recordWebhookSubscriptionCreateDenied,
  recordWebhookSubscriptionCreated,
  toWebhookAuditReasonCode,
} from "./record-webhook-audit.js";
import { mintWebhookSigningSecret } from "./webhook-signing-secret-lifecycle.js";
import {
  assertWebhookManageAccess,
  assertV1WebhookChannels,
  buildWebhookAuditScope,
  toPayload,
  validateEventCodes,
} from "./webhook-subscription-shared.js";
import type {
  CreateWebhookSubscriptionInput,
  WebhookSubscriptionPayload,
} from "./webhook-subscription-types.js";

export async function createWebhookSubscription(
  input: CreateWebhookSubscriptionInput,
): Promise<WebhookSubscriptionPayload> {
  const auditScope = buildWebhookAuditScope(input);

  try {
    validateEventCodes(input.eventCodes);
    assertV1WebhookChannels(input);
    await assertWebhookManageAccess(input.accessActor, input.organizationId);

    const subscriptionId = webhookSubscriptionId.generate();
    const signingSecretId = webhookSigningSecretId.generate();
    const created = await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) =>
        new TenantWebhookSubscriptionStore(db).create({
          organizationId: input.organizationId,
          subscriptionId,
          displayName: input.displayName,
          eventCodes: input.eventCodes,
          ...(input.deliveryEmail !== undefined ? { deliveryEmail: input.deliveryEmail } : {}),
          enableEmailChannel: input.enableEmailChannel,
          enableInAppChannel: input.enableInAppChannel,
          createdByUserId: input.actorUserId,
        }),
    );
    const { plaintext } = await mintWebhookSigningSecret({
      keyring: input.keyring,
      organizationId: input.organizationId,
      subscriptionId,
      signingSecretId,
    });
    await recordWebhookSubscriptionCreated({ ...auditScope, subscriptionId });
    return toPayload(created, bytesToBase64Url(plaintext));
  } catch (error) {
    await recordWebhookSubscriptionCreateDenied({
      ...auditScope,
      reasonCode: toWebhookAuditReasonCode(error),
    });
    throw error;
  }
}

export function parseCreateWebhookSubscriptionDisplayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw Object.assign(new Error(parsed.code), { code: parsed.code });
  }
  return parsed.value;
}
