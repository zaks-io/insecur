import * as audit from "@insecur/audit";
import { operationId, organizationId, projectId, userId } from "@insecur/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recordHighAssuranceChallengeDenied } from "../src/record-high-assurance-challenge-audit.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const DENYING_USER = userId.brand("usr_00000000000000000000000002");
const REQUESTING_USER = userId.brand("usr_00000000000000000000000001");
const CHALLENGE_ID = "req_0123456789ABCDEFGHJKMNPQRS";

describe("high-assurance challenge deny audit validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts challenge deny as a successful reviewer action event", () => {
    expect(() => {
      audit.validateAuditEventInput({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeDenied,
        outcome: "success",
        actor: { type: "user", userId: DENYING_USER },
        organizationId: ORG,
        projectId: PRJ,
        resource: { type: "operation", id: OP },
        details: {
          challengeId: CHALLENGE_ID,
          riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
          requestingUserId: REQUESTING_USER,
        },
      });
    }).not.toThrow();
  });

  it("recordHighAssuranceChallengeDenied writes an audit event that passes validation", async () => {
    const writeSpy = vi.spyOn(audit, "writeAuditEvent").mockResolvedValue({
      auditEventId: audit.generateAuditEventId(),
    });

    await recordHighAssuranceChallengeDenied({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      denyingUserId: DENYING_USER,
      challengeId: CHALLENGE_ID,
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
      requestingUserId: REQUESTING_USER,
    });

    const event = writeSpy.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    if (event === undefined) {
      throw new Error("expected writeAuditEvent to be called");
    }
    expect(() => audit.validateAuditEventInput(event)).not.toThrow();
    expect(event).toMatchObject({
      eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeDenied,
      outcome: "success",
    });
  });
});
