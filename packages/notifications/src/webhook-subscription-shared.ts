import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import type { AuditRequestRef } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  NOTIFICATION_ERROR_CODES,
  type OrganizationId,
  type RequestId,
  type UserId,
  type WebhookSubscriptionId,
} from "@insecur/domain";
import { TenantWebhookSubscriptionStore, toIsoTimestamp } from "@insecur/tenant-store";

import { isWebhookEventCode } from "./webhook-event-codes.js";
import type {
  WebhookSubscriptionPayload,
  WebhookSubscriptionRead,
} from "./webhook-subscription-types.js";

function insufficientScopeError() {
  return Object.assign(new Error("Insufficient scope."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

export function validateEventCodes(eventCodes: readonly string[]): void {
  if (eventCodes.length === 0) {
    throw Object.assign(new Error("At least one webhook event type is required."), {
      code: NOTIFICATION_ERROR_CODES.invalidEventCode,
    });
  }
  for (const eventCode of eventCodes) {
    if (!isWebhookEventCode(eventCode)) {
      throw Object.assign(new Error("Invalid webhook event type."), {
        code: NOTIFICATION_ERROR_CODES.invalidEventCode,
      });
    }
  }
}

/** V1 supports in-app delivery only; reject email affordances until a port is wired. */
export function assertV1WebhookChannels(input: {
  readonly enableEmailChannel?: boolean;
  readonly deliveryEmail?: string | null;
}): void {
  if (input.enableEmailChannel === true || input.deliveryEmail !== undefined) {
    throw Object.assign(new Error("Email channel is not available in V1."), {
      code: NOTIFICATION_ERROR_CODES.deliveryFailed,
    });
  }
}

export function buildWebhookSubscriptionAuditScope(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly subscriptionId: WebhookSubscriptionId;
  readonly requestId?: RequestId;
}) {
  return {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId,
    ...(input.requestId !== undefined
      ? ({ request: { requestId: input.requestId } } satisfies { request: AuditRequestRef })
      : {}),
  };
}

export function buildWebhookAuditScope(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly requestId?: RequestId;
}) {
  return {
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    ...(input.requestId !== undefined
      ? ({ request: { requestId: input.requestId } } satisfies { request: AuditRequestRef })
      : {}),
  };
}

export async function assertWebhookManageAccess(
  accessActor: Parameters<typeof resolveEffectiveAccess>[0],
  organizationId: OrganizationId,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(accessActor, { organizationId });
  if (!hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.webhookManage)) {
    throw insufficientScopeError();
  }
}

export async function assertWebhookReadAccess(
  accessActor: Parameters<typeof resolveEffectiveAccess>[0],
  organizationId: OrganizationId,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(accessActor, { organizationId });
  if (!hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.webhookRead)) {
    throw insufficientScopeError();
  }
}

export function toPayload(
  row: Awaited<ReturnType<TenantWebhookSubscriptionStore["get"]>>,
  signingSecretPlaintext: string,
): WebhookSubscriptionPayload {
  if (!row) {
    throw new Error("subscription missing");
  }
  return {
    subscriptionId: row.subscriptionId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    status: row.status,
    eventCodes: row.eventCodes,
    deliveryEmail: row.deliveryEmail,
    enableEmailChannel: row.enableEmailChannel,
    enableInAppChannel: row.enableInAppChannel,
    signingSecret: signingSecretPlaintext,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  };
}

export function toReadPayload(
  row: NonNullable<Awaited<ReturnType<TenantWebhookSubscriptionStore["get"]>>>,
): WebhookSubscriptionRead {
  return {
    subscriptionId: row.subscriptionId,
    organizationId: row.organizationId,
    displayName: row.displayName,
    status: row.status,
    eventCodes: row.eventCodes,
    deliveryEmail: row.deliveryEmail,
    enableEmailChannel: row.enableEmailChannel,
    enableInAppChannel: row.enableInAppChannel,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  };
}
