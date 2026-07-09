import { auditEventId, environmentId, machineIdentityId, projectId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_ERROR_CODES, OperationStoreError } from "../src/operation-errors.js";
import type { OperationHighAssuranceChallengeEvidence } from "../src/operation-types.js";
import { assertHighAssuranceChallengeEvidence } from "../src/validate-high-assurance-challenge-progress.js";

const baseEvidence = {
  challengeId: "challenge_test_token_001",
  riskReasonCode: "high_assurance.risk.agent_step_up",
  projectId: projectId.brand("prj_00000000000000000000000001"),
  requestingUserId: userId.brand("usr_00000000000000000000000001"),
  requestedAt: "2026-07-03T00:00:00.000Z",
  expiresAt: "2026-07-03T00:10:00.000Z",
  requestAuditEventId: auditEventId.brand("aud_00000000000000000000000001"),
} satisfies OperationHighAssuranceChallengeEvidence;

function expectInvalidMetadata(
  evidence: OperationHighAssuranceChallengeEvidence,
  message: RegExp,
): void {
  try {
    assertHighAssuranceChallengeEvidence(evidence);
    expect.fail("Expected high-assurance challenge evidence validation to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(OperationStoreError);
    expect(error).toMatchObject({
      code: OPERATION_ERROR_CODES.invalidMetadata,
      message: expect.stringMatching(message),
    });
  }
}

describe("assertHighAssuranceChallengeEvidence", () => {
  it("accepts pending evidence requested by a user", () => {
    expect(() => assertHighAssuranceChallengeEvidence(baseEvidence)).not.toThrow();
  });

  it("accepts machine-requested evidence with optional lifecycle metadata", () => {
    expect(() =>
      assertHighAssuranceChallengeEvidence({
        ...baseEvidence,
        environmentId: environmentId.brand("env_00000000000000000000000001"),
        requestingUserId: undefined,
        requestingMachineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
        clearedAt: "2026-07-03T00:02:00.000Z",
        clearingUserId: userId.brand("usr_00000000000000000000000002"),
        clearAuthenticationMethodCode: "auth.assurance.passkey",
        clearAuditEventId: auditEventId.brand("aud_00000000000000000000000002"),
        consumedAt: "2026-07-03T00:03:00.000Z",
        consumeAuditEventId: auditEventId.brand("aud_00000000000000000000000003"),
        denyingUserId: userId.brand("usr_00000000000000000000000003"),
        denyAuditEventId: auditEventId.brand("aud_00000000000000000000000004"),
      }),
    ).not.toThrow();
  });

  it("requires either a requesting user or requesting machine identity", () => {
    expectInvalidMetadata(
      {
        ...baseEvidence,
        requestingUserId: undefined,
      },
      /requires requestingUserId or requestingMachineIdentityId/,
    );
  });

  it("rejects malformed required high-assurance fields", () => {
    const cases = [
      {
        evidence: { ...baseEvidence, challengeId: "" },
        message: /challengeId must be a 1-256 character opaque token/,
      },
      {
        evidence: { ...baseEvidence, riskReasonCode: "HIGH_ASSURANCE" },
        message: /riskReasonCode must be a stable dotted code/,
      },
      {
        evidence: { ...baseEvidence, projectId: "org_00000000000000000000000001" as never },
        message: /projectId must be a project opaque ID/,
      },
      {
        evidence: { ...baseEvidence, projectId: 123 as never },
        message: /projectId must be a project opaque ID/,
      },
      {
        evidence: { ...baseEvidence, requestedAt: "soon" },
        message: /requestedAt must be an ISO-8601 timestamp/,
      },
      {
        evidence: { ...baseEvidence, expiresAt: "later" },
        message: /expiresAt must be an ISO-8601 timestamp/,
      },
      {
        evidence: {
          ...baseEvidence,
          requestAuditEventId: "req_00000000000000000000000001" as never,
        },
        message: /requestAuditEventId must be an audit event opaque ID/,
      },
      {
        evidence: { ...baseEvidence, requestAuditEventId: 123 as never },
        message: /requestAuditEventId must be an audit event opaque ID/,
      },
    ] satisfies readonly {
      readonly evidence: OperationHighAssuranceChallengeEvidence;
      readonly message: RegExp;
    }[];

    for (const testCase of cases) {
      expectInvalidMetadata(testCase.evidence, testCase.message);
    }
  });

  it("rejects malformed optional high-assurance lifecycle fields", () => {
    const cases = [
      {
        evidence: { ...baseEvidence, environmentId: "prj_00000000000000000000000001" as never },
        message: /environmentId must be an environment opaque ID/,
      },
      {
        evidence: { ...baseEvidence, environmentId: 123 as never },
        message: /environmentId must be an environment opaque ID/,
      },
      {
        evidence: {
          ...baseEvidence,
          requestingUserId: "mach_00000000000000000000000001" as never,
        },
        message: /requestingUserId must be a user opaque ID/,
      },
      {
        evidence: { ...baseEvidence, requestingUserId: 123 as never },
        message: /requestingUserId must be a user opaque ID/,
      },
      {
        evidence: {
          ...baseEvidence,
          requestingMachineIdentityId: "usr_00000000000000000000000001" as never,
        },
        message: /requestingMachineIdentityId must be a machine identity opaque ID/,
      },
      {
        evidence: {
          ...baseEvidence,
          requestingMachineIdentityId: 123 as never,
        },
        message: /requestingMachineIdentityId must be a machine identity opaque ID/,
      },
      {
        evidence: { ...baseEvidence, clearedAt: "done" },
        message: /clearedAt must be an ISO-8601 timestamp/,
      },
      {
        evidence: { ...baseEvidence, clearingUserId: "aud_00000000000000000000000001" as never },
        message: /clearingUserId must be a user opaque ID/,
      },
      {
        evidence: { ...baseEvidence, clearAuthenticationMethodCode: "PASSKEY" },
        message: /clearAuthenticationMethodCode must be a stable dotted code/,
      },
      {
        evidence: {
          ...baseEvidence,
          clearAuditEventId: "usr_00000000000000000000000001" as never,
        },
        message: /clearAuditEventId must be an audit event opaque ID/,
      },
      {
        evidence: { ...baseEvidence, consumedAt: "now" },
        message: /consumedAt must be an ISO-8601 timestamp/,
      },
      {
        evidence: {
          ...baseEvidence,
          consumeAuditEventId: "usr_00000000000000000000000001" as never,
        },
        message: /consumeAuditEventId must be an audit event opaque ID/,
      },
      {
        evidence: { ...baseEvidence, denyingUserId: "aud_00000000000000000000000001" as never },
        message: /denyingUserId must be a user opaque ID/,
      },
      {
        evidence: {
          ...baseEvidence,
          denyAuditEventId: "usr_00000000000000000000000001" as never,
        },
        message: /denyAuditEventId must be an audit event opaque ID/,
      },
    ] satisfies readonly {
      readonly evidence: OperationHighAssuranceChallengeEvidence;
      readonly message: RegExp;
    }[];

    for (const testCase of cases) {
      expectInvalidMetadata(testCase.evidence, testCase.message);
    }
  });
});
