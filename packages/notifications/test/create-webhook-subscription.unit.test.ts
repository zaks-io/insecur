import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { writeAuditEvent } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  NOTIFICATION_ERROR_CODES,
  organizationId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
  TenantWebhookSubscriptionStore: vi.fn(),
  TenantWebhookSigningSecretStore: vi.fn(),
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn(),
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: vi.fn(),
    hasAuthorizationScope: vi.fn(),
  };
});

import { hasAuthorizationScope, resolveEffectiveAccess } from "@insecur/access";
import { withTenantScope } from "@insecur/tenant-store";
import { createWebhookSubscription } from "../src/create-webhook-subscription.js";
import { listWebhookSubscriptions } from "../src/list-webhook-subscriptions.js";
import {
  deleteWebhookSubscription,
  updateWebhookSubscription,
} from "../src/update-webhook-subscription.js";
import { WEBHOOK_EVENT_CODES } from "../src/webhook-event-codes.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };

const resolveEffectiveAccessMock = vi.mocked(resolveEffectiveAccess);
const hasAuthorizationScopeMock = vi.mocked(hasAuthorizationScope);
const withTenantScopeMock = vi.mocked(withTenantScope);
const writeAuditEventMock = vi.mocked(writeAuditEvent);

describe("createWebhookSubscription validation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid event codes before persistence and records denied audit", async () => {
    await expect(
      createWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        displayName: "Alerts",
        eventCodes: ["unknown.event"],
        enableEmailChannel: false,
        enableInAppChannel: true,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.invalidEventCode,
    });

    expect(withTenantScopeMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalled();
  });

  it("rejects email delivery without a delivery email", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.webhookManage],
    } as never);
    hasAuthorizationScopeMock.mockReturnValue(true);

    await expect(
      createWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        displayName: "Alerts",
        eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
        enableEmailChannel: true,
        enableInAppChannel: false,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.deliveryFailed,
    });

    expect(withTenantScopeMock).not.toHaveBeenCalled();
  });
});

describe("webhook subscription access and mutation guards", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("denies list access without webhook:read", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({ scopes: [] } as never);
    hasAuthorizationScopeMock.mockReturnValue(false);

    await expect(
      listWebhookSubscriptions({
        organizationId: ORG,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(withTenantScopeMock).not.toHaveBeenCalled();
  });

  it("rejects update with invalid event codes", async () => {
    await expect(
      updateWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        eventCodes: ["unknown.event"],
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.invalidEventCode,
    });
    expect(writeAuditEventMock).toHaveBeenCalled();
  });

  it("records denied audit when delete lacks manage scope", async () => {
    resolveEffectiveAccessMock.mockResolvedValue({ scopes: [] } as never);
    hasAuthorizationScopeMock.mockReturnValue(false);

    await expect(
      deleteWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(writeAuditEventMock).toHaveBeenCalled();
  });
});
