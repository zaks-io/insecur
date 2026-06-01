import {
  AUDIT_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { AuditEventValidationError, validateAuditEventInput } from "../src/validate-audit-event.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("audit ErrorBody-compatible failures", () => {
  it("AuditEventValidationError carries a known code and retryable flag", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      });
    }).toThrow(AuditEventValidationError);

    try {
      validateAuditEventInput({
        eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
        outcome: "denied",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      });
      expect.fail("expected validation to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AuditEventValidationError);
      expect((error as AuditEventValidationError).code).toBe(AUDIT_ERROR_CODES.eventInvalid);
      expect((error as AuditEventValidationError).retryable).toBe(false);
    }
  });
});
