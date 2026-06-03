import { environmentId, organizationId, projectId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { PRODUCTION_AUDIT_EVENT_CODES } from "../src/audit-event-codes.js";
import { buildAuditEventInput } from "../src/build-audit-event.js";
import { AuditEventValidationError, validateAuditEventInput } from "../src/validate-audit-event.js";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "../src/index.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("audit tenant and project scoping", () => {
  it("requires organizationId on every event", () => {
    const built = buildAuditEventInput({
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.accessDenied,
      outcome: "denied",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      denial: { reasonCode: "auth.insufficient_scope" },
    });

    expect(built.organizationId).toBe(ORG);
  });

  it("accepts project-scoped events with environment qualification", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      });
    }).not.toThrow();
  });

  it("rejects environment scope without project scope", () => {
    expect(() => {
      validateAuditEventInput({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.syncExecutionCompleted,
        outcome: "success",
        actor: { type: "user", userId: USER },
        organizationId: ORG,
        environmentId: ENV,
      });
    }).toThrow(AuditEventValidationError);
  });
});
