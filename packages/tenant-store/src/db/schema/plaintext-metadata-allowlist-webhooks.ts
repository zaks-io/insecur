import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Webhook subscription tables (ADR-0070 fragment, INS-453). */
export const PLAINTEXT_METADATA_ALLOWLIST_WEBHOOKS = {
  webhook_subscriptions: {
    created_at: { category: "timestamp" },
    created_by_user_id: { category: "actor-id" },
    delivery_email: { category: "display-name" },
    display_name: { category: "display-name" },
    enable_email_channel: { category: "flag" },
    enable_in_app_channel: { category: "flag" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    status: { category: "status-code" },
    updated_at: { category: "timestamp" },
  },
  webhook_subscription_event_types: {
    created_at: { category: "timestamp" },
    event_code: { category: "type-code" },
    org_id: { category: "opaque-id" },
    subscription_id: { category: "opaque-id" },
  },
  webhook_signing_secrets: {
    ciphertext_storage_ref: { category: "ciphertext-ref" },
    created_at: { category: "timestamp" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    organization_data_key_version: { category: "key-version" },
    retired_at: { category: "timestamp" },
    status: { category: "status-code" },
    subscription_id: { category: "opaque-id" },
  },
  in_app_event_notifications: {
    created_at: { category: "timestamp" },
    envelope_payload: { category: "validated-payload" },
    id: { category: "opaque-id" },
    org_id: { category: "opaque-id" },
    signature: { category: "ciphertext-ref" },
    signature_timestamp: { category: "timestamp" },
    subscription_id: { category: "opaque-id" },
    webhook_event_code: { category: "type-code" },
  },
} as const satisfies PlaintextMetadataAllowlist;
