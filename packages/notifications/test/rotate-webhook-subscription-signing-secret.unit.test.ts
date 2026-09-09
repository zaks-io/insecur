import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { writeAuditEvent } from "@insecur/audit";
import { encryptProviderCredential } from "@insecur/crypto";
import {
  NOTIFICATION_ERROR_CODES,
  organizationId,
  userId,
  webhookSigningSecretId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/crypto")>();
  return { ...actual, encryptProviderCredential: vi.fn() };
});

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
  TenantWebhookSubscriptionStore: vi.fn(),
  TenantWebhookSigningSecretStore: vi.fn(),
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return { ...actual, writeAuditEvent: vi.fn() };
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
import { rotateWebhookSubscriptionSigningSecret } from "../src/rotate-webhook-subscription-signing-secret.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");
const ACTIVE_SECRET = webhookSigningSecretId.brand("whsec_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };

const resolveEffectiveAccessMock = vi.mocked(resolveEffectiveAccess);
const hasAuthorizationScopeMock = vi.mocked(hasAuthorizationScope);
const encryptProviderCredentialMock = vi.mocked(encryptProviderCredential);
const withTenantScopeMock = vi.mocked(withTenantScope);
const subscriptionStoreMock = vi.mocked(TenantWebhookSubscriptionStore);
const signingSecretStoreMock = vi.mocked(TenantWebhookSigningSecretStore);

function arrangeRotation(retired: boolean) {
  resolveEffectiveAccessMock.mockResolvedValue({
    scopes: [AUTHORIZATION_SCOPES.webhookManage],
  } as never);
  hasAuthorizationScopeMock.mockReturnValue(true);
  const wrapped = { organizationDataKeyVersion: 1 } as never;
  encryptProviderCredentialMock.mockResolvedValue(wrapped);

  const get = vi.fn().mockResolvedValue({ subscriptionId: SUBSCRIPTION });
  const getActiveSecret = vi.fn().mockResolvedValue({ id: ACTIVE_SECRET });
  const retireActiveSecret = vi.fn().mockResolvedValue(retired);
  const insertSecret = vi.fn().mockResolvedValue(undefined);
  subscriptionStoreMock.mockImplementation(function MockSubscriptionStore() {
    return { get } as never;
  });
  signingSecretStoreMock.mockImplementation(function MockSigningSecretStore() {
    return { getActiveSecret, retireActiveSecret, insertSecret } as never;
  });
  withTenantScopeMock.mockImplementation(async (_scope, callback) =>
    callback({ db: {} as never, sql: {} as never }),
  );

  return { wrapped, retireActiveSecret, insertSecret };
}

describe("rotateWebhookSubscriptionSigningSecret", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retires and inserts the replacement in one write transaction", async () => {
    const { wrapped, retireActiveSecret, insertSecret } = arrangeRotation(true);

    await expect(
      rotateWebhookSubscriptionSigningSecret({
        actorUserId: USER,
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).resolves.toEqual({ signingSecret: expect.any(String) });

    expect(withTenantScopeMock).toHaveBeenCalledTimes(2);
    expect(retireActiveSecret).toHaveBeenCalledWith(ORG, SUBSCRIPTION, ACTIVE_SECRET);
    expect(insertSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        wrapped,
      }),
    );
    expect(retireActiveSecret.mock.invocationCallOrder[0]).toBeLessThan(
      insertSecret.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects a stale rotation without inserting a second active secret", async () => {
    const { insertSecret } = arrangeRotation(false);

    await expect(
      rotateWebhookSubscriptionSigningSecret({
        actorUserId: USER,
        organizationId: ORG,
        subscriptionId: SUBSCRIPTION,
        keyring: {} as never,
        accessActor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: NOTIFICATION_ERROR_CODES.signingSecretMissing });

    expect(insertSecret).not.toHaveBeenCalled();
    expect(writeAuditEvent).not.toHaveBeenCalled();
  });
});
