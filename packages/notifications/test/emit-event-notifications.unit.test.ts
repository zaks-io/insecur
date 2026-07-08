import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  NOTIFICATION_ERROR_CODES,
  machineIdentityId,
  organizationId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/decrypt-webhook-signing-secret.js", () => ({
  decryptWebhookSigningSecret: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock("../src/record-webhook-audit.js", () => ({
  recordWebhookDeliverySucceeded: vi.fn(),
  recordWebhookDeliveryFailed: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
  TenantWebhookSubscriptionStore: vi.fn(),
  TenantWebhookSigningSecretStore: vi.fn(),
  TenantInAppEventNotificationStore: vi.fn(),
}));

import {
  withTenantScope,
  TenantWebhookSubscriptionStore,
  TenantWebhookSigningSecretStore,
} from "@insecur/tenant-store";
import { recordWebhookDeliveryFailed } from "../src/record-webhook-audit.js";
import { emitEventNotificationsForEnvelope } from "../src/emit-event-notifications.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");

function baseEmitInput() {
  return {
    keyring: {} as never,
    organizationId: ORG,
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
    envelope: {
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      timestamp: "2026-07-07T12:00:00.000Z",
      organizationId: ORG,
      displayNames: { organization: "Acme" },
      actor: { type: "user" as const, id: USER },
      status: "success" as const,
    },
    deliveryPorts: {
      inApp: { persistEventNotification: vi.fn() },
    },
    sourceAuditEvent: {
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      outcome: "success" as const,
      actor: { type: "user" as const, userId: USER },
      organizationId: ORG,
    },
  };
}

describe("emitEventNotificationsForEnvelope", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when no subscriptions match the event code", async () => {
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => run({ db: {} } as never));
    vi.mocked(TenantWebhookSubscriptionStore).mockImplementation(
      class {
        listActiveByEventCode = vi.fn().mockResolvedValue([]);
      } as never,
    );

    await emitEventNotificationsForEnvelope(baseEmitInput());

    expect(TenantWebhookSubscriptionStore).toHaveBeenCalled();
  });

  it("swallows listing failures without rethrowing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(withTenantScope).mockRejectedValue(new Error("transient DB error"));

    await expect(emitEventNotificationsForEnvelope(baseEmitInput())).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("swallows recordDeliveryAudit failures without rethrowing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => run({ db: {} } as never));
    vi.mocked(TenantWebhookSubscriptionStore).mockImplementation(
      class {
        listActiveByEventCode = vi.fn().mockResolvedValue([
          {
            subscriptionId: SUBSCRIPTION,
            organizationId: ORG,
            enableInAppChannel: false,
            enableEmailChannel: false,
          },
        ]);
      } as never,
    );
    vi.mocked(TenantWebhookSigningSecretStore).mockImplementation(
      class {
        getActiveSecret = vi.fn().mockResolvedValue(null);
      } as never,
    );
    vi.mocked(recordWebhookDeliveryFailed).mockRejectedValue(
      new Error("nested audit write failed"),
    );

    await expect(emitEventNotificationsForEnvelope(baseEmitInput())).resolves.toBeUndefined();

    expect(recordWebhookDeliveryFailed).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("records delivery failure when no channel is enabled", async () => {
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => run({ db: {} } as never));
    vi.mocked(TenantWebhookSubscriptionStore).mockImplementation(
      class {
        listActiveByEventCode = vi.fn().mockResolvedValue([
          {
            subscriptionId: SUBSCRIPTION,
            organizationId: ORG,
            enableInAppChannel: false,
            enableEmailChannel: false,
          },
        ]);
      } as never,
    );
    vi.mocked(TenantWebhookSigningSecretStore).mockImplementation(
      class {
        getActiveSecret = vi.fn().mockResolvedValue({
          id: "whsec_00000000000000000000000001",
          wrapped: "wrapped",
        });
      } as never,
    );
    vi.mocked(recordWebhookDeliveryFailed).mockResolvedValue(undefined);

    await emitEventNotificationsForEnvelope(baseEmitInput());

    expect(recordWebhookDeliveryFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: "user", userId: USER },
        subscriptionId: SUBSCRIPTION,
        reasonCode: NOTIFICATION_ERROR_CODES.deliveryFailed,
      }),
    );
  });

  it("records delivery audit for machine-originated source events", async () => {
    vi.mocked(withTenantScope).mockImplementation(async (_scope, run) => run({ db: {} } as never));
    vi.mocked(TenantWebhookSubscriptionStore).mockImplementation(
      class {
        listActiveByEventCode = vi.fn().mockResolvedValue([
          {
            subscriptionId: SUBSCRIPTION,
            organizationId: ORG,
            enableInAppChannel: false,
            enableEmailChannel: false,
          },
        ]);
      } as never,
    );
    vi.mocked(TenantWebhookSigningSecretStore).mockImplementation(
      class {
        getActiveSecret = vi.fn().mockResolvedValue(null);
      } as never,
    );
    vi.mocked(recordWebhookDeliveryFailed).mockResolvedValue(undefined);

    await emitEventNotificationsForEnvelope({
      ...baseEmitInput(),
      sourceAuditEvent: {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: {
          type: "machine",
          machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
        },
        organizationId: ORG,
      },
    });

    expect(recordWebhookDeliveryFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: {
          type: "machine",
          machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
        },
      }),
    );
  });
});
