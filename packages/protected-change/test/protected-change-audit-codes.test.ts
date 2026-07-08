import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { describe, expect, it } from "vitest";

import {
  protectedChangeAuditEventCode,
  type ProtectedChangeAuditAction,
} from "../src/protected-change-audit-codes.js";

const SUCCESS_CASES: readonly [Exclude<ProtectedChangeAuditAction, "transition_denied">, string][] =
  [
    ["request_created", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeRequestCreated],
    ["submitted", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeSubmitted],
    ["approved", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeApproved],
    ["rejected", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeRejected],
    ["canceled", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeCanceled],
    ["stale_closed", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeStaleClosed],
    ["execution_started", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionStarted],
    ["execution_succeeded", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionSucceeded],
    ["execution_failed", PRODUCTION_AUDIT_EVENT_CODES.protectedChangeExecutionFailed],
  ];

describe("protectedChangeAuditEventCode", () => {
  it.each(SUCCESS_CASES)("maps %s success to its own production event code", (action, expected) => {
    expect(protectedChangeAuditEventCode({ action, outcome: "success" })).toBe(expected);
  });

  it.each(SUCCESS_CASES)("collapses %s denied to the transition_denied event code", (action) => {
    expect(protectedChangeAuditEventCode({ action, outcome: "denied" })).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied,
    );
  });

  it("maps the transition_denied action to the transition_denied code regardless of outcome", () => {
    expect(protectedChangeAuditEventCode({ action: "transition_denied", outcome: "success" })).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied,
    );
    expect(protectedChangeAuditEventCode({ action: "transition_denied", outcome: "denied" })).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied,
    );
  });
});
