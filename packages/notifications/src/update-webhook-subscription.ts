import type { ActorRef } from "@insecur/access";
import type {
  DisplayName,
  OrganizationId,
  RequestId,
  UserId,
  WebhookSubscriptionId,
} from "@insecur/domain";
import { TenantWebhookSubscriptionStore, withTenantScope } from "@insecur/tenant-store";

import {
  recordWebhookSubscriptionDeleteDenied,
  recordWebhookSubscriptionDeleted,
  recordWebhookSubscriptionUpdateDenied,
  recordWebhookSubscriptionUpdated,
  toWebhookAuditReasonCode,
} from "./record-webhook-audit.js";
import {
  assertWebhookManageAccess,
  buildWebhookSubscriptionAuditScope,
  toReadPayload,
  validateEventCodes,
} from "./webhook-subscription-shared.js";
import type { WebhookSubscriptionRead } from "./webhook-subscription-types.js";

export async function updateWebhookSubscription(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly displayName?: DisplayName;
  readonly eventCodes?: readonly string[];
  readonly deliveryEmail?: string | null;
  readonly enableEmailChannel?: boolean;
  readonly enableInAppChannel?: boolean;
  readonly status?: "active" | "disabled";
  readonly requestId?: RequestId;
  readonly accessActor: ActorRef;
}): Promise<WebhookSubscriptionRead> {
  const auditScope = buildWebhookSubscriptionAuditScope(input);

  try {
    if (input.eventCodes !== undefined) {
      validateEventCodes(input.eventCodes);
    }
    await assertWebhookManageAccess(input.accessActor, input.organizationId);

    const updated = await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) =>
        new TenantWebhookSubscriptionStore(db).update({
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.eventCodes !== undefined ? { eventCodes: input.eventCodes } : {}),
          ...(input.deliveryEmail !== undefined ? { deliveryEmail: input.deliveryEmail } : {}),
          ...(input.enableEmailChannel !== undefined
            ? { enableEmailChannel: input.enableEmailChannel }
            : {}),
          ...(input.enableInAppChannel !== undefined
            ? { enableInAppChannel: input.enableInAppChannel }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        }),
    );

    await recordWebhookSubscriptionUpdated(auditScope);
    return toReadPayload(updated);
  } catch (error) {
    await recordWebhookSubscriptionUpdateDenied({
      ...auditScope,
      reasonCode: toWebhookAuditReasonCode(error),
    });
    throw error;
  }
}

export async function deleteWebhookSubscription(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly requestId?: RequestId;
  readonly accessActor: ActorRef;
}): Promise<void> {
  const auditScope = buildWebhookSubscriptionAuditScope(input);

  try {
    await assertWebhookManageAccess(input.accessActor, input.organizationId);
    await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ db }) =>
        new TenantWebhookSubscriptionStore(db).update({
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
          status: "disabled",
        }),
    );
    await recordWebhookSubscriptionDeleted(auditScope);
  } catch (error) {
    await recordWebhookSubscriptionDeleteDenied({
      ...auditScope,
      reasonCode: toWebhookAuditReasonCode(error),
    });
    throw error;
  }
}
