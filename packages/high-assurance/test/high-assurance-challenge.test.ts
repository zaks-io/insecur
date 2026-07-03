import {
  auditEventId,
  HIGH_ASSURANCE_ERROR_CODES,
  machineIdentityId,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { AUTHORIZATION_SCOPES } from "@insecur/access";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import { describe, expect, it } from "vitest";
import {
  computeChallengeExpiresAt,
  isChallengeEvidenceExpired,
  mapSessionAssuranceToAuthenticationMethodCode,
} from "../src/high-assurance-challenge-helpers.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";
import {
  assertClearingActorForPendingChallenge,
  buildValidateConsumeActorInput,
  resolveHighAssuranceChallengeStatus,
  validateConsumeActor,
  validateHighAssuranceEvidence,
} from "../src/validate-high-assurance-evidence.js";
import { validateOperationProgress } from "@insecur/operations";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const USER_A = userId.brand("usr_00000000000000000000000001");
const USER_B = userId.brand("usr_00000000000000000000000002");
const MACH = machineIdentityId.brand("mach_00000000000000000000000001");
const ORG_OTHER = organizationId.brand("org_00000000000000000000000002");
const AUD_REQUEST = auditEventId.brand("aud_00000000000000000000000001");

function baseEvidence(
  overrides: Partial<OperationHighAssuranceChallengeEvidence> = {},
): OperationHighAssuranceChallengeEvidence {
  const requestedAt = new Date("2026-07-03T00:00:00.000Z");
  return {
    challengeId: "challenge_test_token_001",
    riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
    projectId: PRJ,
    requestingUserId: USER_A,
    requestedAt: requestedAt.toISOString(),
    expiresAt: computeChallengeExpiresAt(requestedAt, 900),
    requestAuditEventId: AUD_REQUEST,
    ...overrides,
  };
}

function operationWithEvidence(
  evidence: OperationHighAssuranceChallengeEvidence,
  state: OperationPollResult["state"] = "waiting_for_human",
): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state,
    intentCode: "sync.run",
    progress: { highAssuranceChallenge: evidence },
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}

describe("high-assurance challenge evidence validation", () => {
  it("accepts cleared, unexpired, unconsumed evidence for the clearing user", () => {
    const evidence = baseEvidence({
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: auditEventId.brand("aud_00000000000000000000000002"),
    });

    const result = validateHighAssuranceEvidence({
      operation: operationWithEvidence(evidence),
      clearingUserId: USER_A,
      now: new Date("2026-07-03T00:10:00.000Z"),
    });

    expect(result.evidence.challengeId).toBe("challenge_test_token_001");
  });

  it("rejects missing challenge evidence", () => {
    expect(() =>
      validateHighAssuranceEvidence({
        operation: {
          ...operationWithEvidence(baseEvidence()),
          progress: {},
        },
        clearingUserId: USER_A,
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing }));
  });

  it("rejects expired challenge evidence", () => {
    const evidence = baseEvidence({
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      expiresAt: "2026-07-03T00:15:00.000Z",
    });

    expect(() =>
      validateHighAssuranceEvidence({
        operation: operationWithEvidence(evidence),
        clearingUserId: USER_A,
        now: new Date("2026-07-03T00:20:00.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceExpired }));
  });

  it("rejects actor-mismatched clearing user for human-session bounded operations", () => {
    const evidence = baseEvidence({
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_B,
    });

    expect(() =>
      validateHighAssuranceEvidence({
        operation: operationWithEvidence(evidence),
        clearingUserId: USER_A,
        now: new Date("2026-07-03T00:10:00.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.actorMismatch }));
  });

  it("rejects already consumed evidence", () => {
    const evidence = baseEvidence({
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      consumedAt: "2026-07-03T00:06:00.000Z",
    });

    expect(() =>
      validateHighAssuranceEvidence({
        operation: operationWithEvidence(evidence),
        clearingUserId: USER_A,
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed }));
  });
});

describe("machine-origin clearing authorization", () => {
  function machinePendingEvidence(): OperationHighAssuranceChallengeEvidence {
    return {
      ...baseEvidence(),
      requestingUserId: undefined,
      requestingMachineIdentityId: MACH,
    };
  }

  function machineClearedEvidence(): OperationHighAssuranceChallengeEvidence {
    return {
      ...machinePendingEvidence(),
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: auditEventId.brand("aud_00000000000000000000000002"),
    };
  }

  it("rejects clear without required scopes and effective access", () => {
    expect(() =>
      assertClearingActorForPendingChallenge({
        evidence: machinePendingEvidence(),
        organizationId: ORG,
        clearingUserId: USER_A,
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied }));
  });

  it("rejects clear when effective access organization mismatches bounded operation", () => {
    expect(() =>
      assertClearingActorForPendingChallenge({
        evidence: machinePendingEvidence(),
        organizationId: ORG,
        clearingUserId: USER_A,
        requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
        clearingUserAccess: {
          organizationId: ORG_OTHER,
          scopes: [AUTHORIZATION_SCOPES.approvalApprove],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch }));
  });

  it("rejects consume and durable retry without coordinate-bound clearing access", () => {
    const evidence = machineClearedEvidence();

    expect(() =>
      validateConsumeActor(
        buildValidateConsumeActorInput({
          organizationId: ORG,
          evidence,
          clearingUserId: USER_A,
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied }));

    expect(() =>
      validateHighAssuranceEvidence({
        operation: operationWithEvidence(evidence),
        clearingUserId: USER_A,
        now: new Date("2026-07-03T00:10:00.000Z"),
      }),
    ).toThrowError(expect.objectContaining({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied }));
  });

  it("accepts machine-origin clear and consume when scopes match coordinate-bound access", () => {
    const pending = machinePendingEvidence();
    const cleared = machineClearedEvidence();
    const access = {
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalApprove],
    };

    expect(() =>
      assertClearingActorForPendingChallenge({
        evidence: pending,
        organizationId: ORG,
        clearingUserId: USER_A,
        requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
        clearingUserAccess: access,
      }),
    ).not.toThrow();

    expect(() =>
      validateConsumeActor(
        buildValidateConsumeActorInput({
          organizationId: ORG,
          evidence: cleared,
          clearingUserId: USER_A,
          requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
          clearingUserAccess: access,
        }),
      ),
    ).not.toThrow();
  });
});

describe("resolveHighAssuranceChallengeStatus", () => {
  it("reports pending before clearing and cleared after", () => {
    const pending = resolveHighAssuranceChallengeStatus({
      operationId: OP,
      highAssuranceChallenge: baseEvidence(),
      now: "2026-07-03T00:01:00.000Z",
    });
    expect(pending.state).toBe("pending");
    expect(pending.hasClearedEvidence).toBe(false);
    expect(pending.riskReasonCode).toBe(HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp);

    const cleared = resolveHighAssuranceChallengeStatus({
      operationId: OP,
      highAssuranceChallenge: baseEvidence({
        clearedAt: "2026-07-03T00:05:00.000Z",
        clearingUserId: USER_A,
      }),
      now: "2026-07-03T00:06:00.000Z",
    });
    expect(cleared.state).toBe("cleared");
    expect(cleared.hasClearedEvidence).toBe(true);
    expect(cleared.clearingUserId).toBe(USER_A);
  });

  it("reports expired when validity window elapsed", () => {
    const status = resolveHighAssuranceChallengeStatus({
      operationId: OP,
      highAssuranceChallenge: baseEvidence({
        expiresAt: "2026-07-03T00:15:00.000Z",
      }),
      now: "2026-07-03T00:20:00.000Z",
    });
    expect(status.state).toBe("expired");
  });
});

describe("WorkOS session assurance integration", () => {
  it("maps passkey sessions to metadata-safe assurance method codes", () => {
    expect(
      mapSessionAssuranceToAuthenticationMethodCode({
        authenticationMethod: "Passkey",
        authFactors: [],
      }),
    ).toBe("auth.assurance.passkey");
  });

  it("maps TOTP-backed password sessions to totp assurance codes", () => {
    expect(
      mapSessionAssuranceToAuthenticationMethodCode({
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
    ).toBe("auth.assurance.totp");
  });
});

describe("metadata safety", () => {
  it("accepts metadata-only challenge evidence on operation progress", () => {
    expect(() =>
      validateOperationProgress({
        highAssuranceChallenge: baseEvidence({
          clearedAt: "2026-07-03T00:05:00.000Z",
          clearingUserId: USER_A,
          clearAuthenticationMethodCode: "auth.assurance.passkey",
        }),
      }),
    ).not.toThrow();
  });

  it("rejects secret-bearing progress fields alongside challenge evidence", () => {
    expect(() =>
      validateOperationProgress({
        highAssuranceChallenge: baseEvidence(),
        secretValue: "must-not-appear",
      } as never),
    ).toThrow(/progress contains unknown field: secretValue/);
  });

  it("detects expiry without exposing sensitive values in status output", () => {
    expect(
      isChallengeEvidenceExpired("2026-07-03T00:01:00.000Z", new Date("2026-07-03T00:02:00.000Z")),
    ).toBe(true);
    const status = resolveHighAssuranceChallengeStatus({
      operationId: OP,
      highAssuranceChallenge: baseEvidence({ expiresAt: "2026-07-03T00:01:00.000Z" }),
      now: "2026-07-03T00:02:00.000Z",
    });
    expect(JSON.stringify(status)).not.toMatch(/password|secret|plaintext/i);
  });
});
