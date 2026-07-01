import { organizationId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { buildAuditEventInput } from "../src/build-audit-event.js";
import { AuditEventValidationError } from "../src/validate-audit-event.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");

describe("buildAuditEventInput", () => {
  it("returns validated denied events with stable reason codes", () => {
    const event = buildAuditEventInput({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      denial: { reasonCode: "auth.insufficient_scope" },
      details: { gate: "audit.gate.storage_security" },
    });

    expect(event.outcome).toBe("denied");
    expect(event.denial.reasonCode).toBe("auth.insufficient_scope");
    expect(event.details).toEqual({ gate: "audit.gate.storage_security" });
  });

  it("rejects secret-bearing detail keys before persistence", () => {
    expect(() => {
      buildAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        denial: { reasonCode: "auth.insufficient_scope" },
        details: { value: "must-not-appear" },
      });
    }).toThrow(AuditEventValidationError);
  });
});
