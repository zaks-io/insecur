import { FIRST_VALUE_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  createKeyring,
  type Keyring,
} from "@insecur/crypto";
import {
  base64UrlToBytes,
  brandOpaqueResourceIdForPrefix,
  injectionGrantId,
  organizationId,
  parseDisplayName,
  projectId,
  secretId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import {
  clearAuditNotificationEmitter,
  createWebhookSubscription,
  registerAuditNotificationEmitter,
  verifyEventNotificationSignature,
} from "@insecur/notifications";
import {
  TenantInAppEventNotificationStore,
  TenantWebhookSubscriptionStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import { WEBHOOK_EVENT_CODES } from "../src/webhook-event-codes.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const ORG_B = organizationId.brand(TEST_ORG_B_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const USER = userId.brand(TEST_USER_ID);
const ACTOR = { type: "user" as const, userId: USER };

function createTestRootKey(): Uint8Array {
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  return root;
}

function parseName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

describeRls("webhook subscriptions and event notifications", () => {
  let keyring: Keyring;
  let signingSecretPlaintext: Uint8Array;
  let subscriptionId: ReturnType<typeof webhookSubscriptionId.generate>;

  beforeAll(async () => {
    await seedTenantBaseline();
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    keyring = createKeyring(createTestRootKey());
    registerAuditNotificationEmitter({ keyring });
  });

  afterAll(async () => {
    clearAuditNotificationEmitter();
    await closeRuntimeSql();
  });

  beforeEach(() => {
    subscriptionId = webhookSubscriptionId.generate();
    signingSecretPlaintext = new Uint8Array(32);
  });

  it("delivers HMAC-signed in-app notifications only for subscribed event types", async () => {
    const created = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async () =>
        createWebhookSubscription({
          actorUserId: USER,
          organizationId: ORG_A,
          displayName: parseName("Security alerts"),
          eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
          enableEmailChannel: false,
          enableInAppChannel: true,
          keyring,
          accessActor: ACTOR,
        }),
    );
    subscriptionId = created.subscriptionId as ReturnType<typeof webhookSubscriptionId.generate>;
    const decodedSecret = base64UrlToBytes(created.signingSecret);
    expect(decodedSecret).not.toBeNull();
    signingSecretPlaintext = decodedSecret as Uint8Array;

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async () => {
      await writeAuditEvent({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        resource: {
          type: "secret",
          id: brandOpaqueResourceIdForPrefix(
            "sec",
            secretId.brand("sec_00000000000000000000000001"),
          ),
        },
      });
    });

    const delivered = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) =>
        new TenantInAppEventNotificationStore(db).listForSubscription(ORG_A, subscriptionId),
    );
    expect(delivered.length).toBe(1);
    const firstDelivery = delivered[0];
    expect(firstDelivery).toBeDefined();
    if (!firstDelivery) {
      throw new Error("expected delivered notification");
    }
    await expect(
      verifyEventNotificationSignature(
        {
          envelope: JSON.parse(firstDelivery.envelopePayload),
          signature: firstDelivery.signature,
          signatureTimestamp: firstDelivery.signatureTimestamp.toISOString(),
        },
        signingSecretPlaintext,
      ),
    ).resolves.toBe(true);

    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async () => {
      await writeAuditEvent({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.injectionGrantIssued,
        outcome: "success",
        actor: ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        resource: {
          type: "injection_grant",
          id: brandOpaqueResourceIdForPrefix(
            "igr",
            injectionGrantId.brand("igr_00000000000000000000000001"),
          ),
        },
      });
    });

    const afterUnsubscribed = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) =>
        new TenantInAppEventNotificationStore(db).listForSubscription(ORG_A, subscriptionId),
    );
    expect(afterUnsubscribed.length).toBe(1);
  });

  it("isolates webhook subscriptions under forced RLS across tenants", async () => {
    const orgASubscription = webhookSubscriptionId.generate();
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      await new TenantWebhookSubscriptionStore(db).create({
        organizationId: ORG_A,
        subscriptionId: orgASubscription,
        displayName: parseName("Org A alerts"),
        eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
        enableEmailChannel: false,
        enableInAppChannel: true,
        createdByUserId: USER,
      });
    });

    const orgBView = await withTenantScope(
      { kind: "organization", organizationId: ORG_B },
      async ({ db }) => new TenantWebhookSubscriptionStore(db).list(ORG_B),
    );
    expect(orgBView.some((row) => row.subscriptionId === orgASubscription)).toBe(false);

    const orgAView = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => new TenantWebhookSubscriptionStore(db).list(ORG_A),
    );
    expect(orgAView.some((row) => row.subscriptionId === orgASubscription)).toBe(true);
  });
});
