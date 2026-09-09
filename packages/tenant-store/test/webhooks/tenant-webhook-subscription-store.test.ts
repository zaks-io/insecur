import {
  inAppEventNotificationId,
  organizationId,
  userId,
  webhookSigningSecretId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { TenantInAppEventNotificationStore } from "../../src/webhooks/tenant-in-app-event-notification-store.js";
import { TenantWebhookSigningSecretStore } from "../../src/webhooks/tenant-webhook-signing-secret-store.js";
import { TenantWebhookSubscriptionStore } from "../../src/webhooks/tenant-webhook-subscription-store.js";
import { createMockTenantDb } from "../helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const SIGNING_SECRET = webhookSigningSecretId.brand("whsec_01JZ8EFH2R7M4T0V9X3C5D8F1G");
const SETUP_USER = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const NOW = new Date("2026-07-07T12:00:00.000Z");

const SUBSCRIPTION_ROW = {
  id: SUBSCRIPTION,
  orgId: ORG,
  displayName: "Security alerts",
  status: "active",
  deliveryEmail: null,
  enableEmailChannel: false,
  enableInAppChannel: true,
  createdByUserId: SETUP_USER,
  createdAt: NOW,
  updatedAt: NOW,
};

describe("TenantWebhookSubscriptionStore", () => {
  it("returns null when a subscription is missing", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantWebhookSubscriptionStore(db);

    await expect(store.get(ORG, SUBSCRIPTION)).resolves.toBeNull();
  });

  it("hydrates event codes when loading a subscription", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[SUBSCRIPTION_ROW], [{ eventCode: "secret.non_protected_write" }]],
    });
    const store = new TenantWebhookSubscriptionStore(db);

    const row = await store.get(ORG, SUBSCRIPTION);

    expect(row).toMatchObject({
      subscriptionId: SUBSCRIPTION,
      organizationId: ORG,
      eventCodes: ["secret.non_protected_write"],
      enableInAppChannel: true,
    });
  });

  it("lists subscriptions for an organization", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[SUBSCRIPTION_ROW], [{ eventCode: "secret.non_protected_write" }]],
    });
    const store = new TenantWebhookSubscriptionStore(db);

    const rows = await store.list(ORG);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.subscriptionId).toBe(SUBSCRIPTION);
  });
});

describe("TenantWebhookSigningSecretStore", () => {
  it("returns null when no active signing secret exists", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });
    const store = new TenantWebhookSigningSecretStore(db);

    await expect(store.getActiveSecret(ORG, SUBSCRIPTION)).resolves.toBeNull();
  });

  it("retires an active signing secret with a subscription-scoped compare-and-set", async () => {
    const { db, updateWheres } = createMockTenantDb({
      updateReturning: [[{ id: SIGNING_SECRET }]],
    });
    const store = new TenantWebhookSigningSecretStore(db);

    await expect(store.retireActiveSecret(ORG, SUBSCRIPTION, SIGNING_SECRET)).resolves.toBe(true);

    const query = new PgDialect().sqlToQuery(updateWheres[0] as never);
    expect(query.sql).toContain('"webhook_signing_secrets"."org_id" = $1');
    expect(query.sql).toContain('"webhook_signing_secrets"."subscription_id" = $2');
    expect(query.sql).toContain('"webhook_signing_secrets"."id" = $3');
    expect(query.sql).toContain('"webhook_signing_secrets"."status" = $4');
    expect(query.params).toEqual([ORG, SUBSCRIPTION, SIGNING_SECRET, "active"]);
  });

  it("reports a stale signing-secret retirement", async () => {
    const { db } = createMockTenantDb({ updateReturning: [[]] });
    const store = new TenantWebhookSigningSecretStore(db);

    await expect(store.retireActiveSecret(ORG, SUBSCRIPTION, SIGNING_SECRET)).resolves.toBe(false);
  });
});

describe("TenantInAppEventNotificationStore", () => {
  it("lists in-app notifications for a subscription", async () => {
    const notificationId = inAppEventNotificationId.brand("inev_01JZ8EFH2R7M4T0V9X3C5D8F1G");
    const { db, insertValues } = createMockTenantDb({
      selectResults: [
        [
          {
            id: notificationId,
            webhookEventCode: "secret.non_protected_write",
            envelopePayload: "{}",
            signature: "sig",
            signatureTimestamp: NOW,
            createdAt: NOW,
          },
        ],
      ],
    });
    const store = new TenantInAppEventNotificationStore(db);

    await store.insert({
      organizationId: ORG,
      notificationId,
      subscriptionId: SUBSCRIPTION,
      webhookEventCode: "secret.non_protected_write",
      envelopePayload: "{}",
      signature: "sig",
      signatureTimestamp: NOW,
    });
    const rows = await store.listForSubscription(ORG, SUBSCRIPTION);

    expect(insertValues[0]).toMatchObject({ subscriptionId: SUBSCRIPTION });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notificationId).toBe(notificationId);
  });
});
