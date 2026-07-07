import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditEventCode,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  type KnownErrorCode,
  type OrganizationId,
  type UserId,
  type WebhookSubscriptionId,
} from "@insecur/domain";

function subscriptionResource(subscriptionId: WebhookSubscriptionId) {
  return {
    type: "webhook_subscription" as const,
    id: brandOpaqueResourceIdForPrefix("whsub", subscriptionId),
  };
}

interface WebhookAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly request?: AuditRequestRef;
}

async function writeWebhookSuccessAudit(
  input: WebhookAuditScope & {
    readonly eventCode: AuditEventCode;
    readonly subscriptionId: WebhookSubscriptionId;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    resource: subscriptionResource(input.subscriptionId),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

async function writeWebhookDeniedAudit(
  input: WebhookAuditScope & {
    readonly eventCode: AuditEventCode;
    readonly reasonCode: KnownErrorCode;
    readonly subscriptionId?: WebhookSubscriptionId;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    ...(input.subscriptionId !== undefined
      ? { resource: subscriptionResource(input.subscriptionId) }
      : {}),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordWebhookSubscriptionCreateDenied(
  input: WebhookAuditScope & { readonly reasonCode: KnownErrorCode },
): Promise<void> {
  await writeWebhookDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreateDenied,
  });
}

export async function recordWebhookSubscriptionCreated(
  input: WebhookAuditScope & { readonly subscriptionId: WebhookSubscriptionId },
): Promise<void> {
  await writeWebhookSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreated,
  });
}

export async function recordWebhookSubscriptionUpdateDenied(
  input: WebhookAuditScope & {
    readonly reasonCode: KnownErrorCode;
    readonly subscriptionId?: WebhookSubscriptionId;
  },
): Promise<void> {
  await writeWebhookDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionUpdateDenied,
  });
}

export async function recordWebhookSubscriptionUpdated(
  input: WebhookAuditScope & { readonly subscriptionId: WebhookSubscriptionId },
): Promise<void> {
  await writeWebhookSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionUpdated,
  });
}

export async function recordWebhookSubscriptionDeleteDenied(
  input: WebhookAuditScope & {
    readonly reasonCode: KnownErrorCode;
    readonly subscriptionId?: WebhookSubscriptionId;
  },
): Promise<void> {
  await writeWebhookDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionDeleteDenied,
  });
}

export async function recordWebhookSubscriptionDeleted(
  input: WebhookAuditScope & { readonly subscriptionId: WebhookSubscriptionId },
): Promise<void> {
  await writeWebhookSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionDeleted,
  });
}

export async function recordWebhookDeliverySucceeded(
  input: WebhookAuditScope & { readonly subscriptionId: WebhookSubscriptionId },
): Promise<void> {
  await writeWebhookSuccessAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookDeliverySucceeded,
  });
}

export async function recordWebhookDeliveryFailed(
  input: WebhookAuditScope & {
    readonly subscriptionId: WebhookSubscriptionId;
    readonly reasonCode: KnownErrorCode;
  },
): Promise<void> {
  await writeWebhookDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookDeliveryFailed,
  });
}

export function toWebhookAuditReasonCode(error: unknown): KnownErrorCode {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return AUTH_ERROR_CODES.insufficientScope;
}
