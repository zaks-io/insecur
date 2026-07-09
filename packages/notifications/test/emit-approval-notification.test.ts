import { PRODUCTION_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import { approvalRequestId, organizationId, userId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return { ...actual, writeAuditEvent: vi.fn() };
});

import type { ApprovalDeliveryPorts, ApprovalNotificationEnvelope } from "../src/index.js";
import { emitApprovalNotification } from "../src/emit-approval-notification.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("apr_00000000000000000000000001");
const WEB_BASE = "https://app.insecur.cloud";
const CREATED_AT = new Date("2026-07-07T00:00:00.000Z");

function makePorts(overrides: Partial<ApprovalDeliveryPorts> = {}): {
  ports: ApprovalDeliveryPorts;
  inApp: ReturnType<typeof vi.fn>;
  email: ReturnType<typeof vi.fn>;
} {
  const inApp = vi.fn().mockResolvedValue(undefined);
  const email = vi.fn().mockResolvedValue(undefined);
  const ports: ApprovalDeliveryPorts = {
    recipients: {
      resolveApprovers: vi
        .fn()
        .mockResolvedValue([{ userId: "usr_approver_1", email: "approver@example.com" }]),
    },
    inApp: { persistApprovalAlert: inApp },
    email: { sendApprovalAlert: email },
    ...overrides,
  };
  return { ports, inApp, email };
}

function emit(ports: ApprovalDeliveryPorts): Promise<void> {
  return emitApprovalNotification({
    organizationId: ORG,
    approvalRequestId: APPROVAL,
    createdAt: CREATED_AT,
    auditActor: { type: "user", userId: USER },
    webBaseUrl: WEB_BASE,
    deliveryPorts: ports,
  });
}

function deliveredEnvelope(call: unknown): ApprovalNotificationEnvelope {
  return (call as { envelope: ApprovalNotificationEnvelope }).envelope;
}

describe("emitApprovalNotification", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("alerts the approver over in-app and email with a metadata-safe envelope", async () => {
    const { ports, inApp, email } = makePorts();
    await emit(ports);

    expect(inApp).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);

    const inAppEnvelope = deliveredEnvelope(inApp.mock.calls[0]?.[0]);
    const emailEnvelope = deliveredEnvelope(email.mock.calls[0]?.[0]);
    expect(inAppEnvelope).toEqual(emailEnvelope);
    expect(inAppEnvelope.deepLinkUrl).toBe(`${WEB_BASE}/orgs/${ORG}/approvals/${APPROVAL}`);
    expect(inAppEnvelope.kind).toBe("approval_notification");
    expect(inAppEnvelope.alert).toBe("approval_pending");
  });

  it("delivered envelope carries none of the enumerated sensitive fields", async () => {
    const { ports, inApp } = makePorts();
    await emit(ports);

    const envelope = deliveredEnvelope(inApp.mock.calls[0]?.[0]);
    const serialized = JSON.stringify(envelope);

    for (const forbidden of [
      "contextNote",
      "displayName",
      "sensitiveValue",
      "sensitiveMetadata",
      "impact",
      "approveUrl",
      "rejectUrl",
      "actionUrl",
      "secret",
    ]) {
      expect(envelope).not.toHaveProperty(forbidden);
    }
    // No approve/reject verb leaks into the serialized payload at all.
    expect(serialized).not.toMatch(/approve|reject|secret|context.?note|display.?name/i);
    expect(Object.keys(envelope).sort()).toEqual([
      "alert",
      "approvalRequestId",
      "createdAt",
      "deepLinkUrl",
      "kind",
      "organizationId",
    ]);
  });

  it("records a metadata-only sent audit against the approval_request resource", async () => {
    const { ports } = makePorts();
    await emit(ports);

    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(writeAuditEvent).mock.calls[0]?.[0];
    expect(event?.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationSent);
    expect(event?.outcome).toBe("success");
    expect(event?.resource).toEqual({ type: "approval_request", id: APPROVAL });
    // The bounded recipient count is actually recorded in the metadata-safe details map.
    expect(event?.details).toEqual({ recipientCount: 1 });
    // Nothing beyond metadata is present on the audit event.
    expect(JSON.stringify(event)).not.toMatch(/approve|reject|secret|context.?note/i);
  });

  it("still delivers in-app when the approver has no email", async () => {
    const inApp = vi.fn().mockResolvedValue(undefined);
    const email = vi.fn().mockResolvedValue(undefined);
    const ports: ApprovalDeliveryPorts = {
      recipients: { resolveApprovers: vi.fn().mockResolvedValue([{ userId: "usr_approver_1" }]) },
      inApp: { persistApprovalAlert: inApp },
      email: { sendApprovalAlert: email },
    };
    await emit(ports);

    expect(inApp).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it("still records a sent audit when one channel fails but the other delivers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // in-app fails, email still delivers -> at least one delivery -> sent.
    const { ports } = makePorts({
      inApp: { persistApprovalAlert: vi.fn().mockRejectedValue(new Error("db down")) },
    });

    await expect(emit(ports)).resolves.toBeUndefined();
    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(writeAuditEvent).mock.calls[0]?.[0];
    expect(event?.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationSent);
    expect(event?.details).toEqual({ recipientCount: 1 });
  });

  it("records a FAILED audit (not sent) when every channel fails for every approver", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ports } = makePorts({
      inApp: { persistApprovalAlert: vi.fn().mockRejectedValue(new Error("db down")) },
      email: { sendApprovalAlert: vi.fn().mockRejectedValue(new Error("smtp down")) },
    });

    await emit(ports);

    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(writeAuditEvent).mock.calls[0]?.[0];
    expect(event?.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationFailed);
    expect(event?.outcome).toBe("denied");
  });

  it("records a FAILED audit (not sent) when no approvers resolve", async () => {
    const { ports } = makePorts({
      recipients: { resolveApprovers: vi.fn().mockResolvedValue([]) },
    });

    await emit(ports);

    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAuditEvent).mock.calls[0]?.[0]?.eventCode).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationFailed,
    );
  });

  it("records a failed audit when approver resolution throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { ports } = makePorts({
      recipients: { resolveApprovers: vi.fn().mockRejectedValue(new Error("resolver down")) },
    });

    await emit(ports);

    expect(writeAuditEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeAuditEvent).mock.calls[0]?.[0]?.eventCode).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationFailed,
    );
  });
});
