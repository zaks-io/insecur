/**
 * Webhook subscription and event notification tables (INS-453).
 */
/* Stryker disable ObjectLiteral */
import { primaryKey } from "drizzle-orm/pg-core";
import {
  check,
  foreignKey,
  integer,
  pgTable,
  sql,
  text,
  timestamp,
  unique,
  boolean,
} from "./pg-core.js";
import { organizations } from "./tenant-hierarchy.js";
import { orgSubscriptionFkey } from "./pg-identifier-names.js";
import { orgScopedNamedResourceBaseColumns } from "./tenant-org-scoped-named-resource.js";

export const WEBHOOK_SUBSCRIPTION_STATUSES = ["active", "disabled"] as const;

export const WEBHOOK_SIGNING_SECRET_STATUSES = ["active", "retired"] as const;

export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    ...orgScopedNamedResourceBaseColumns(),
    deliveryEmail: text("delivery_email"),
    enableEmailChannel: boolean("enable_email_channel").notNull().default(false),
    enableInAppChannel: boolean("enable_in_app_channel").notNull().default(true),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("webhook_subscriptions_org_id_id_key").on(table.orgId, table.id),
    check("webhook_subscriptions_status_check", sql`${table.status} IN ('active', 'disabled')`),
  ],
);

export const webhookSubscriptionEventTypes = pgTable(
  "webhook_subscription_event_types",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subscriptionId: text("subscription_id").notNull(),
    eventCode: text("event_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "wh_sub_event_types_pk",
      columns: [table.orgId, table.subscriptionId, table.eventCode],
    }),
    foreignKey({
      name: orgSubscriptionFkey("webhook_subscription_event_types"),
      columns: [table.orgId, table.subscriptionId],
      foreignColumns: [webhookSubscriptions.orgId, webhookSubscriptions.id],
    }),
    check(
      "webhook_subscription_event_types_event_code_check",
      sql`${table.eventCode} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' AND char_length(${table.eventCode}) <= 128`,
    ),
  ],
);

export const webhookSigningSecrets = pgTable(
  "webhook_signing_secrets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subscriptionId: text("subscription_id").notNull(),
    organizationDataKeyVersion: integer("organization_data_key_version").notNull(),
    ciphertextStorageRef: text("ciphertext_storage_ref").notNull(),
    status: text("status").notNull().default("active"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("webhook_signing_secrets_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: orgSubscriptionFkey("webhook_signing_secrets"),
      columns: [table.orgId, table.subscriptionId],
      foreignColumns: [webhookSubscriptions.orgId, webhookSubscriptions.id],
    }),
    check("webhook_signing_secrets_status_check", sql`${table.status} IN ('active', 'retired')`),
  ],
);

export const inAppEventNotifications = pgTable(
  "in_app_event_notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    subscriptionId: text("subscription_id").notNull(),
    webhookEventCode: text("webhook_event_code").notNull(),
    envelopePayload: text("envelope_payload").notNull(),
    signature: text("signature").notNull(),
    signatureTimestamp: timestamp("signature_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("in_app_event_notifications_org_id_id_key").on(table.orgId, table.id),
    foreignKey({
      name: orgSubscriptionFkey("in_app_event_notifications"),
      columns: [table.orgId, table.subscriptionId],
      foreignColumns: [webhookSubscriptions.orgId, webhookSubscriptions.id],
    }),
    check(
      "in_app_event_notifications_webhook_event_code_check",
      sql`${table.webhookEventCode} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' AND char_length(${table.webhookEventCode}) <= 128`,
    ),
  ],
);
