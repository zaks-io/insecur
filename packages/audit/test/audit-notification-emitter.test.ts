import { auditEventId, organizationId, userId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import {
  emitAuditNotificationIfConfigured,
  setAuditNotificationEmitter,
} from "../src/audit-notification-emitter.js";
import { insertAuditEventRow } from "../src/insert-audit-event-row.js";
import {
  writeAuditEventInTenantScope,
  writeAuditEventInTenantScopeWithId,
} from "../src/write-audit-event.js";

vi.mock("../src/insert-audit-event-row.js", () => ({
  insertAuditEventRow: vi.fn().mockResolvedValue(undefined),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

const successEvent = {
  eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
  outcome: "success" as const,
  actor: { type: "user" as const, userId: USER },
  organizationId: ORG,
};

describe("emitAuditNotificationIfConfigured", () => {
  afterEach(() => {
    setAuditNotificationEmitter(null);
    vi.clearAllMocks();
  });

  it("swallows emitter failures without rethrowing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    setAuditNotificationEmitter(async () => {
      throw new Error("listing query failed");
    });

    await expect(emitAuditNotificationIfConfigured(successEvent)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe("writeAuditEvent notification emission", () => {
  afterEach(() => {
    setAuditNotificationEmitter(null);
    vi.clearAllMocks();
  });

  it("persists the audit row when notification emission fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setAuditNotificationEmitter(async () => {
      throw new Error("transient notification failure");
    });

    const result = await writeAuditEventInTenantScope({} as never, successEvent);

    expect(result.auditEventId).toMatch(/^aud_[0-9A-Z]{26}$/);
  });

  it("does not emit notifications when an idempotent audit insert is deduplicated", async () => {
    const emitter = vi.fn().mockResolvedValue(undefined);
    setAuditNotificationEmitter(emitter);

    const fixedAuditEventId = auditEventId.brand("aud_00000000000000000000000001");
    const sql = {} as never;

    await writeAuditEventInTenantScopeWithId(sql, successEvent, fixedAuditEventId);
    expect(emitter).toHaveBeenCalledTimes(1);

    vi.mocked(insertAuditEventRow).mockRejectedValueOnce({ code: "23505" });

    await writeAuditEventInTenantScopeWithId(sql, successEvent, fixedAuditEventId);
    expect(emitter).toHaveBeenCalledTimes(1);
  });
});
