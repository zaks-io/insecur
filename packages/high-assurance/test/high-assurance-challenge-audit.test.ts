import { machineIdentityId, operationId, organizationId, projectId, userId } from "@insecur/domain";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordHighAssuranceChallengeRequestDenied,
  recordHighAssuranceChallengeRequested,
} from "../src/record-high-assurance-challenge-audit.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";

const { writeAuditEvent, writeAuditEventWithId } = vi.hoisted(() => ({
  writeAuditEvent: vi.fn(),
  writeAuditEventWithId: vi.fn(),
}));

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent,
    writeAuditEventWithId,
  };
});

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const USER_A = userId.brand("usr_00000000000000000000000001");
const MACH = machineIdentityId.brand("mach_00000000000000000000000001");

describe("machine-origin challenge request audits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditEvent.mockResolvedValue({ auditEventId: "aud_00000000000000000000000010" });
    writeAuditEventWithId.mockResolvedValue({ auditEventId: "aud_00000000000000000000000010" });
  });

  it("records machine actor on successful request audit", async () => {
    await recordHighAssuranceChallengeRequested({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      requestingMachineIdentityId: MACH,
      challengeId: "challenge_test_token_001",
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequested,
        outcome: "success",
        actor: { type: "machine", machineIdentityId: MACH },
        details: expect.objectContaining({
          requestingMachineIdentityId: MACH,
        }),
      }),
    );
  });

  it("records machine actor on request-denied audit", async () => {
    await recordHighAssuranceChallengeRequestDenied({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      requestingMachineIdentityId: MACH,
      reasonCode: "operation.invalid_transition",
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: PRODUCTION_AUDIT_EVENT_CODES.highAssuranceChallengeRequestDenied,
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: MACH },
      }),
    );
  });

  it("prefers machine actor over user when both identifiers are present", async () => {
    await recordHighAssuranceChallengeRequested({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      requestingUserId: USER_A,
      requestingMachineIdentityId: MACH,
      challengeId: "challenge_test_token_001",
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
    });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: "machine", machineIdentityId: MACH },
      }),
    );
  });
});
