import { emitAuditNotificationIfConfigured } from "../../audit/src/audit-notification-emitter.js";
import { organizationId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAuditNotificationEmitter,
  registerAuditNotificationEmitter,
} from "../src/register-audit-notification-emitter.js";

vi.mock("../src/resolve-envelope-display-names.js", () => ({
  resolveEnvelopeDisplayNames: vi.fn(async () => ({
    organization: "Acme",
  })),
}));

vi.mock("../src/emit-event-notifications.js", () => ({
  buildEnvelopeFromAuditEvent: vi.fn(() => ({
    eventCode: "secret.non_protected_write",
    timestamp: "2026-07-07T12:00:00.000Z",
    organizationId: "org_00000000000000000000000001",
    displayNames: {},
    actor: { type: "user", id: "usr_00000000000000000000000001" },
    status: "success",
  })),
  createInAppDeliveryPort: vi.fn(() => ({ persistEventNotification: vi.fn() })),
  emitEventNotificationsForEnvelope: vi.fn(),
}));

import { emitEventNotificationsForEnvelope } from "../src/emit-event-notifications.js";
import { resolveEnvelopeDisplayNames } from "../src/resolve-envelope-display-names.js";

const ORG = organizationId.brand("org_00000000000000000000000001");

describe("registerAuditNotificationEmitter", () => {
  afterEach(() => {
    clearAuditNotificationEmitter();
    vi.clearAllMocks();
  });

  it("registers an emitter that builds envelopes and forwards delivery", async () => {
    registerAuditNotificationEmitter({ keyring: {} as never });
    const event = {
      eventCode: "secret.non_protected_write",
      outcome: "success" as const,
      actor: { type: "user" as const, userId: "usr_00000000000000000000000001" },
      organizationId: ORG,
    };

    await emitAuditNotificationIfConfigured(event);

    expect(resolveEnvelopeDisplayNames).toHaveBeenCalledWith(event);
    expect(emitEventNotificationsForEnvelope).toHaveBeenCalledTimes(1);
    clearAuditNotificationEmitter();
    await emitAuditNotificationIfConfigured(event);
    expect(emitEventNotificationsForEnvelope).toHaveBeenCalledTimes(1);
  });
});
