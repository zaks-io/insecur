import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import { encryptProviderCredential } from "@insecur/crypto";
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
  toIsoTimestamp: (value: Date) => value.toISOString(),
}));

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return { ...actual, encryptProviderCredential: vi.fn() };
});

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
import {
  TenantWebhookSigningSecretStore,
  TenantWebhookSubscriptionStore,
  withTenantScope,
} from "@insecur/tenant-store";
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
const encryptProviderCredentialMock = vi.mocked(encryptProviderCredential);
const subscriptionStoreMock = vi.mocked(TenantWebhookSubscriptionStore);
const signingSecretStoreMock = vi.mocked(TenantWebhookSigningSecretStore);

function allowWebhookManagement(): void {
  resolveEffectiveAccessMock.mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.webhookManage],
  } as never);
  hasAuthorizationScopeMock.mockReturnValue(true);
}

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

  it("rejects email channel affordances in V1", async () => {
    allowWebhookManagement();

    await expect(
      createWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        displayName: "Alerts",
        eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
        enableEmailChannel: true,
        deliveryEmail: "alerts@example.com",
        enableInAppChannel: false,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({
      code: NOTIFICATION_ERROR_CODES.deliveryFailed,
    });

    expect(withTenantScopeMock).not.toHaveBeenCalled();
  });

  it("does not open a write transaction when signing-secret encryption fails", async () => {
    allowWebhookManagement();
    encryptProviderCredentialMock.mockRejectedValue(new Error("encryption failed"));

    await expect(
      createWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        displayName: "Alerts",
        eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
        enableEmailChannel: false,
        enableInAppChannel: true,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).rejects.toThrow("encryption failed");

    expect(withTenantScopeMock).not.toHaveBeenCalled();
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreateDenied,
        outcome: "denied",
      }),
    );
  });

  it("writes the subscription and signing secret in one tenant transaction", async () => {
    allowWebhookManagement();
    const wrapped = {
      organizationDataKeyVersion: 1,
      wrappedDek: new Uint8Array([1]),
      ciphertext: new Uint8Array([2]),
      iv: new Uint8Array([3]),
    } as never;
    encryptProviderCredentialMock.mockResolvedValue(wrapped);
    const create = vi.fn().mockResolvedValue({
      subscriptionId: SUBSCRIPTION,
      organizationId: ORG,
      displayName: "Alerts",
      status: "active",
      eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
      deliveryEmail: null,
      enableEmailChannel: false,
      enableInAppChannel: true,
      createdAt: new Date("2026-09-08T00:00:00.000Z"),
      updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    });
    const insertSecret = vi.fn().mockResolvedValue(undefined);
    subscriptionStoreMock.mockImplementation(function MockSubscriptionStore() {
      return { create } as never;
    });
    signingSecretStoreMock.mockImplementation(function MockSigningSecretStore() {
      return { insertSecret } as never;
    });
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never, sql: {} as never }),
    );

    await createWebhookSubscription({
      actorUserId: USER,
      organizationId: ORG,
      displayName: "Alerts",
      eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
      enableEmailChannel: false,
      enableInAppChannel: true,
      keyring: {} as never,
      accessActor: ACTOR,
    });

    expect(withTenantScopeMock).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(insertSecret).toHaveBeenCalledWith(expect.objectContaining({ wrapped }));
    expect(writeAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.webhookSubscriptionCreated,
        outcome: "success",
      }),
    );
  });

  it("rejects subscriptions with no enabled delivery channel in V1", async () => {
    await expect(
      createWebhookSubscription({
        actorUserId: USER,
        organizationId: ORG,
        displayName: "Alerts",
        eventCodes: [WEBHOOK_EVENT_CODES.secretNonProtectedWrite],
        enableEmailChannel: false,
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
