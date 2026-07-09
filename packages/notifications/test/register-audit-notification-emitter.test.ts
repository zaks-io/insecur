import { emitAuditNotificationIfConfigured } from "../../audit/src/audit-notification-emitter.js";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { organizationId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApprovalDeliveryPorts } from "../src/approval-delivery-ports.js";
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

vi.mock("../src/emit-approval-notification.js", () => ({
  emitApprovalNotification: vi.fn(),
}));

import { emitApprovalNotification } from "../src/emit-approval-notification.js";
import { emitEventNotificationsForEnvelope } from "../src/emit-event-notifications.js";
import { resolveEnvelopeDisplayNames } from "../src/resolve-envelope-display-names.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const APPROVAL_RESOURCE_ID = "apr_00000000000000000000000001";

const approvalDeliveryPorts = {
  recipients: { resolveApprovers: vi.fn() },
  inApp: { persistApprovalAlert: vi.fn() },
} as unknown as ApprovalDeliveryPorts;

const approvalCreatedEvent = {
  eventCode: PRODUCTION_AUDIT_EVENT_CODES.approvalRequestCreated,
  outcome: "success" as const,
  actor: { type: "user" as const, userId: "usr_00000000000000000000000001" },
  organizationId: ORG,
  resource: { type: "approval_request" as const, id: APPROVAL_RESOURCE_ID as never },
};

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

  it("fires an approval notification on approval.request_created when approval wiring is present", async () => {
    registerAuditNotificationEmitter({
      keyring: {} as never,
      approval: { deliveryPorts: approvalDeliveryPorts, webBaseUrl: "https://app.insecur.cloud" },
    });

    await emitAuditNotificationIfConfigured(approvalCreatedEvent);

    expect(emitApprovalNotification).toHaveBeenCalledTimes(1);
    const call = vi.mocked(emitApprovalNotification).mock.calls[0]?.[0];
    expect(call?.organizationId).toBe(ORG);
    expect(call?.approvalRequestId).toBe(APPROVAL_RESOURCE_ID);
    expect(call?.webBaseUrl).toBe("https://app.insecur.cloud");
  });

  it("does not fire an approval notification for unrelated event codes", async () => {
    registerAuditNotificationEmitter({
      keyring: {} as never,
      approval: { deliveryPorts: approvalDeliveryPorts, webBaseUrl: "https://app.insecur.cloud" },
    });

    await emitAuditNotificationIfConfigured({
      eventCode: "secret.non_protected_write",
      outcome: "success" as const,
      actor: { type: "user" as const, userId: "usr_00000000000000000000000001" },
      organizationId: ORG,
    });

    expect(emitApprovalNotification).not.toHaveBeenCalled();
  });

  it("loudly logs (not silently skips) an approval alert when delivery wiring is absent", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerAuditNotificationEmitter({ keyring: {} as never });

    await emitAuditNotificationIfConfigured(approvalCreatedEvent);

    // No fake delivery, and the unwired state is surfaced loudly referencing the follow-up ticket.
    expect(emitApprovalNotification).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/NOT wired/);
    expect(errorSpy.mock.calls[0]?.[0]).toMatch(/INS-531/);
    errorSpy.mockRestore();
  });
});
