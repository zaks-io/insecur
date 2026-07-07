import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { organizationId, userId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn(),
  TenantWebhookSubscriptionStore: vi.fn(),
  TenantWebhookSigningSecretStore: vi.fn(),
  TenantInAppEventNotificationStore: vi.fn(),
}));

import { withTenantScope, TenantWebhookSubscriptionStore } from "@insecur/tenant-store";
import { emitEventNotificationsForEnvelope } from "../src/emit-event-notifications.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

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

    await emitEventNotificationsForEnvelope({
      keyring: {} as never,
      organizationId: ORG,
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
      envelope: {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        timestamp: "2026-07-07T12:00:00.000Z",
        organizationId: ORG,
        displayNames: { organization: "Acme" },
        actor: { type: "user", id: USER },
        status: "success",
      },
      deliveryPorts: {
        inApp: { persistEventNotification: vi.fn() },
      },
      sourceAuditEvent: {
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
      },
    });

    expect(TenantWebhookSubscriptionStore).toHaveBeenCalled();
  });
});
