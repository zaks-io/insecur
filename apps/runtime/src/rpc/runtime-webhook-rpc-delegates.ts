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
  RuntimeRpcResult,
  UpdateWebhookSubscriptionRpcInput,
  UpdateWebhookSubscriptionRpcPayload,
} from "@insecur/worker-kit";

import {
  createWebhookSubscriptionOperation,
  deleteWebhookSubscriptionOperation,
  listWebhookEventCodesOperation,
  listWebhookSubscriptionsOperation,
  rotateWebhookSigningSecretOperation,
  updateWebhookSubscriptionOperation,
} from "../operations/webhook-subscription-operations.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";
import type { RuntimeEnv } from "../env.js";

export function createWebhookSubscriptionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: CreateWebhookSubscriptionRpcInput,
): Promise<RuntimeRpcResult<CreateWebhookSubscriptionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    createWebhookSubscriptionOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}

export function listWebhookSubscriptionsRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ListWebhookSubscriptionsRpcInput,
): Promise<RuntimeRpcResult<ListWebhookSubscriptionsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listWebhookSubscriptionsOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}

export function updateWebhookSubscriptionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: UpdateWebhookSubscriptionRpcInput,
): Promise<RuntimeRpcResult<UpdateWebhookSubscriptionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    updateWebhookSubscriptionOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}

export function deleteWebhookSubscriptionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: DeleteWebhookSubscriptionRpcInput,
): Promise<RuntimeRpcResult<DeleteWebhookSubscriptionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    deleteWebhookSubscriptionOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}

export function rotateWebhookSigningSecretRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: RotateWebhookSigningSecretRpcInput,
): Promise<RuntimeRpcResult<RotateWebhookSigningSecretRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    rotateWebhookSigningSecretOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}

export function listWebhookEventCodesRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ListWebhookEventCodesRpcInput,
): Promise<RuntimeRpcResult<ListWebhookEventCodesRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listWebhookEventCodesOperation({
      env,
      auditActor,
      accessActor,
      input,
    }),
  );
}
