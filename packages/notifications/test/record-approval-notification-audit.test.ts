import {
  PRODUCTION_AUDIT_EVENT_CODES,
  validateAuditEventInput,
  writeAuditEvent,
} from "@insecur/audit";
import {
  approvalRequestId,
  NOTIFICATION_ERROR_CODES,
  organizationId,
  userId,
} from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return { ...actual, writeAuditEvent: vi.fn() };
});

import {
  recordApprovalNotificationFailed,
  recordApprovalNotificationSent,
} from "../src/record-approval-notification-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("apr_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };

describe("record-approval-notification-audit", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records the recipient count in the metadata-safe details map and passes validation", async () => {
    await recordApprovalNotificationSent({
      actor: ACTOR,
      organizationId: ORG,
      approvalRequestId: APPROVAL,
      recipientCount: 3,
    });

    const event = vi.mocked(writeAuditEvent).mock.calls[0]?.[0];
    if (event === undefined) {
      throw new Error("expected writeAuditEvent to be called");
    }
    expect(event.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationSent);
    expect(event.details).toEqual({ recipientCount: 3 });
    // The bounded integer is a valid metadata-safe detail: the real validator accepts it.
    expect(() => validateAuditEventInput(event)).not.toThrow();
  });

  it("records a denied failed audit with a notification reason code that validates", async () => {
    await recordApprovalNotificationFailed({
      actor: ACTOR,
      organizationId: ORG,
      approvalRequestId: APPROVAL,
      reasonCode: NOTIFICATION_ERROR_CODES.deliveryFailed,
    });

    const event = vi.mocked(writeAuditEvent).mock.calls[0]?.[0];
    if (event === undefined) {
      throw new Error("expected writeAuditEvent to be called");
    }
    expect(event.eventCode).toBe(PRODUCTION_AUDIT_EVENT_CODES.approvalNotificationFailed);
    expect(event.outcome).toBe("denied");
    expect(() => validateAuditEventInput(event)).not.toThrow();
  });
});
