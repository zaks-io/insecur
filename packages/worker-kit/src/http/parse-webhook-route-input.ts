import { webhookSubscriptionId, type WebhookSubscriptionId } from "@insecur/domain";

import { parseValue } from "./parse-route-input-shared.js";

const parseWebhookSubscriptionResourceId = (raw: string) => webhookSubscriptionId.parse(raw);

export function parseWebhookSubscriptionIdParam(raw: string): WebhookSubscriptionId {
  return parseValue(raw, parseWebhookSubscriptionResourceId, "Invalid webhook subscription id.");
}
