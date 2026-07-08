export const NOTIFICATIONS_AUDIT_EVENT_CODES = {
  webhookSubscriptionCreated: "webhook.subscription_created",
  webhookSubscriptionCreateDenied: "webhook.subscription_create_denied",
  webhookSubscriptionUpdated: "webhook.subscription_updated",
  webhookSubscriptionUpdateDenied: "webhook.subscription_update_denied",
  webhookSubscriptionDeleted: "webhook.subscription_deleted",
  webhookSubscriptionDeleteDenied: "webhook.subscription_delete_denied",
  webhookDeliverySucceeded: "webhook.delivery_succeeded",
  webhookDeliveryFailed: "webhook.delivery_failed",
} as const;
