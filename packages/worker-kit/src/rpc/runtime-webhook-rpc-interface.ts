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
} from "./runtime-webhook-rpc-contract.js";
import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";

export interface RuntimeWebhookRpc {
  createWebhookSubscription(
    input: CreateWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<CreateWebhookSubscriptionRpcPayload>>;
  listWebhookSubscriptions(
    input: ListWebhookSubscriptionsRpcInput,
  ): Promise<RuntimeRpcResult<ListWebhookSubscriptionsRpcPayload>>;
  updateWebhookSubscription(
    input: UpdateWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<UpdateWebhookSubscriptionRpcPayload>>;
  deleteWebhookSubscription(
    input: DeleteWebhookSubscriptionRpcInput,
  ): Promise<RuntimeRpcResult<DeleteWebhookSubscriptionRpcPayload>>;
  rotateWebhookSigningSecret(
    input: RotateWebhookSigningSecretRpcInput,
  ): Promise<RuntimeRpcResult<RotateWebhookSigningSecretRpcPayload>>;
  listWebhookEventCodes(
    input: ListWebhookEventCodesRpcInput,
  ): Promise<RuntimeRpcResult<ListWebhookEventCodesRpcPayload>>;
}
