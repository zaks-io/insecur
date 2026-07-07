import type { ActorRef } from "@insecur/access";
import { auditActorUserId, type AuditActorRef } from "@insecur/audit";
import {
  createWebhookSubscription,
  deleteWebhookSubscription,
  listWebhookEventCodes,
  listWebhookSubscriptions,
  rotateWebhookSubscriptionSigningSecret,
  updateWebhookSubscription,
} from "@insecur/notifications";
import type {
  CreateWebhookSubscriptionRpcInput,
  CreateWebhookSubscriptionRpcPayload,
  DeleteWebhookSubscriptionRpcInput,
  DeleteWebhookSubscriptionRpcPayload,
  ListWebhookEventCodesRpcInput,
  ListWebhookEventCodesRpcPayload,
  ListWebhookSubscriptionsRpcInput,
  ListWebhookSubscriptionsRpcPayload,
  RotateWebhookSigningSecretRpcInput,
  RotateWebhookSigningSecretRpcPayload,
  UpdateWebhookSubscriptionRpcInput,
  UpdateWebhookSubscriptionRpcPayload,
} from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import {
  assertUserOrganizationMembership,
  insufficientScopeError,
} from "./metadata-operation-shared.js";

export interface WebhookOperationContext {
  readonly env: RuntimeEnv;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function requireUserActor(actor: AuditActorRef) {
  const actorUserId = auditActorUserId(actor);
  if (actorUserId === null) {
    throw insufficientScopeError();
  }
  return actorUserId;
}

export async function createWebhookSubscriptionOperation(
  ctx: WebhookOperationContext & { readonly input: CreateWebhookSubscriptionRpcInput },
): Promise<CreateWebhookSubscriptionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actorUserId = requireUserActor(ctx.auditActor);
  return createWebhookSubscription({
    actorUserId,
    organizationId: ctx.input.organizationId,
    displayName: ctx.input.displayName,
    eventCodes: ctx.input.eventCodes,
    ...(ctx.input.deliveryEmail !== undefined ? { deliveryEmail: ctx.input.deliveryEmail } : {}),
    enableEmailChannel: ctx.input.enableEmailChannel,
    enableInAppChannel: ctx.input.enableInAppChannel,
    requestId: ctx.input.requestId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
    accessActor: ctx.accessActor,
  });
}

export async function listWebhookSubscriptionsOperation(
  ctx: WebhookOperationContext & { readonly input: ListWebhookSubscriptionsRpcInput },
): Promise<ListWebhookSubscriptionsRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const subscriptions = await listWebhookSubscriptions({
    organizationId: ctx.input.organizationId,
    accessActor: ctx.accessActor,
  });
  return { subscriptions };
}

export async function updateWebhookSubscriptionOperation(
  ctx: WebhookOperationContext & { readonly input: UpdateWebhookSubscriptionRpcInput },
): Promise<UpdateWebhookSubscriptionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actorUserId = requireUserActor(ctx.auditActor);
  return updateWebhookSubscription({
    actorUserId,
    organizationId: ctx.input.organizationId,
    subscriptionId: ctx.input.subscriptionId,
    ...(ctx.input.displayName !== undefined ? { displayName: ctx.input.displayName } : {}),
    ...(ctx.input.eventCodes !== undefined ? { eventCodes: ctx.input.eventCodes } : {}),
    ...(ctx.input.deliveryEmail !== undefined ? { deliveryEmail: ctx.input.deliveryEmail } : {}),
    ...(ctx.input.enableEmailChannel !== undefined
      ? { enableEmailChannel: ctx.input.enableEmailChannel }
      : {}),
    ...(ctx.input.enableInAppChannel !== undefined
      ? { enableInAppChannel: ctx.input.enableInAppChannel }
      : {}),
    ...(ctx.input.status !== undefined ? { status: ctx.input.status } : {}),
    requestId: ctx.input.requestId,
    accessActor: ctx.accessActor,
  });
}

export async function deleteWebhookSubscriptionOperation(
  ctx: WebhookOperationContext & { readonly input: DeleteWebhookSubscriptionRpcInput },
): Promise<DeleteWebhookSubscriptionRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actorUserId = requireUserActor(ctx.auditActor);
  await deleteWebhookSubscription({
    actorUserId,
    organizationId: ctx.input.organizationId,
    subscriptionId: ctx.input.subscriptionId,
    requestId: ctx.input.requestId,
    accessActor: ctx.accessActor,
  });
  return { ok: true };
}

export async function rotateWebhookSigningSecretOperation(
  ctx: WebhookOperationContext & { readonly input: RotateWebhookSigningSecretRpcInput },
): Promise<RotateWebhookSigningSecretRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  const actorUserId = requireUserActor(ctx.auditActor);
  return rotateWebhookSubscriptionSigningSecret({
    actorUserId,
    organizationId: ctx.input.organizationId,
    subscriptionId: ctx.input.subscriptionId,
    requestId: ctx.input.requestId,
    keyring: createKeyringFromRuntimeEnv(ctx.env),
    accessActor: ctx.accessActor,
  });
}

export async function listWebhookEventCodesOperation(
  ctx: WebhookOperationContext & { readonly input: ListWebhookEventCodesRpcInput },
): Promise<ListWebhookEventCodesRpcPayload> {
  await assertUserOrganizationMembership(ctx.accessActor, ctx.input.organizationId);
  return { eventCodes: listWebhookEventCodes() };
}
