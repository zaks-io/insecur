import {
  auditEventId,
  HIGH_ASSURANCE_ERROR_CODES,
  machineIdentityId,
  OPERATION_ERROR_CODES,
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
import { OperationStoreError, mergeOperationProgress } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClearHighAssuranceChallengeInput } from "../src/high-assurance-challenge-inputs.js";
import {
  assertClearingActorForClear,
  requirePendingChallengeEvidence,
  requireSessionAssuranceForClear,
} from "../src/clear-high-assurance-challenge-preflight.js";
import { clearHighAssuranceChallenge } from "../src/clear-high-assurance-challenge.js";
import { requestHighAssuranceChallenge } from "../src/request-high-assurance-challenge.js";
import { consumeHighAssuranceEvidence } from "../src/consume-high-assurance-evidence.js";
import { mapOperationStoreErrorToDenialReason } from "../src/map-operation-store-denial.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";
import { computeChallengeExpiresAt } from "../src/high-assurance-challenge-helpers.js";
import { resolveHighAssuranceChallengeStatus } from "../src/resolve-high-assurance-challenge-status.js";

const AUD_CLEAR = auditEventId.brand("aud_00000000000000000000000004");

const {
  getOperation,
  transitionOperation,
  recordOperationProgress,
  recordHighAssuranceChallengeRequested,
  recordHighAssuranceChallengeCleared,
  recordHighAssuranceEvidenceConsumed,
  recordHighAssuranceEvidenceConsumeDenied,
  writeAuditEvent,
  generateAuditEventId,
} = vi.hoisted(() => ({
  getOperation: vi.fn(),
  transitionOperation: vi.fn(),
  recordOperationProgress: vi.fn(),
  recordHighAssuranceChallengeRequested: vi.fn(),
  recordHighAssuranceChallengeCleared: vi.fn(),
  recordHighAssuranceEvidenceConsumed: vi.fn(),
  recordHighAssuranceEvidenceConsumeDenied: vi.fn(),
  writeAuditEvent: vi.fn(),
  generateAuditEventId: vi.fn(),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const PRJ_OTHER = projectId.brand("prj_00000000000000000000000002");
const OP = operationId.brand("op_00000000000000000000000001");
const USER_A = userId.brand("usr_00000000000000000000000001");
const USER_B = userId.brand("usr_00000000000000000000000002");
const MACH = machineIdentityId.brand("mach_00000000000000000000000001");
const ORG_OTHER = organizationId.brand("org_00000000000000000000000002");
const AUD_REQUEST = auditEventId.brand("aud_00000000000000000000000001");
const AUD_CONSUME = auditEventId.brand("aud_00000000000000000000000003");

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation,
    transitionOperation,
    recordOperationProgress,
  };
});

vi.mock("../src/record-high-assurance-challenge-audit.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/record-high-assurance-challenge-audit.js")>();
  return {
    ...actual,
    recordHighAssuranceChallengeRequested,
    recordHighAssuranceChallengeCleared,
    recordHighAssuranceEvidenceConsumed,
    recordHighAssuranceEvidenceConsumeDenied,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent,
    generateAuditEventId,
  };
});

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

function clearedEvidence(): OperationHighAssuranceChallengeEvidence {
  return baseEvidence({
    expiresAt: "2027-01-01T00:00:00.000Z",
    clearedAt: "2026-07-03T00:05:00.000Z",
    clearingUserId: USER_A,
    clearAuthenticationMethodCode: "auth.assurance.passkey",
    clearAuditEventId: auditEventId.brand("aud_00000000000000000000000002"),
  });
}

function machineClearedEvidence(): OperationHighAssuranceChallengeEvidence {
  return {
    ...clearedEvidence(),
    requestingUserId: undefined,
    requestingMachineIdentityId: MACH,
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

function clearInput(
  overrides: Partial<ClearHighAssuranceChallengeInput> = {},
): ClearHighAssuranceChallengeInput {
  return {
    organizationId: ORG,
    projectId: PRJ,
    operationId: OP,
    clearingUserId: USER_A,
    sessionAssurance: {
      authenticationMethod: "Passkey",
      authFactors: [],
    },
    ...overrides,
  };
}

describe("clear preflight regressions", () => {
  beforeEach(() => {
    writeAuditEvent.mockResolvedValue({ auditEventId: "aud_00000000000000000000000099" });
  });

  it("rejects password sessions with enrolled TOTP but no fresh step-up", async () => {
    const evidence = baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" });

    await expect(
      requireSessionAssuranceForClear(
        clearInput({
          sessionAssurance: {
            authenticationMethod: "Password",
            authFactors: [{ type: "totp" }],
          },
        }),
        evidence,
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.sessionAssuranceFailed });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        projectId: PRJ,
        denial: { reasonCode: "auth.reauth_required" },
      }),
    );
  });

  it("accepts password sessions when fresh TOTP step-up evidence is present", async () => {
    const evidence = baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" });

    await expect(
      requireSessionAssuranceForClear(
        clearInput({
          sessionAssurance: {
            authenticationMethod: "Password",
            authFactors: [{ type: "totp" }],
            freshStepUpFactor: "totp",
          },
        }),
        evidence,
      ),
    ).resolves.toBe("auth.assurance.totp");
  });

  it("rejects clearing expired pending evidence", async () => {
    const evidence = baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" });

    await expect(
      requirePendingChallengeEvidence(evidence, clearInput(), {
        now: new Date("2026-07-03T00:20:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceExpired });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        projectId: PRJ,
        denial: { reasonCode: HIGH_ASSURANCE_ERROR_CODES.evidenceExpired },
      }),
    );
  });

  it("rejects clear audits scoped to bound evidence project, not caller project", async () => {
    const evidence = baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" });

    await expect(
      requirePendingChallengeEvidence(evidence, clearInput({ projectId: PRJ_OTHER }), {
        now: new Date("2026-07-03T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
      }),
    );
    expect(writeAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ_OTHER,
      }),
    );
  });
});

describe("machine-origin authorization regressions", () => {
  beforeEach(() => {
    writeAuditEvent.mockResolvedValue({ auditEventId: "aud_00000000000000000000000099" });
  });

  it("denies clear without coordinate-bound scopes and access", async () => {
    const evidence = {
      ...baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" }),
      requestingUserId: undefined,
      requestingMachineIdentityId: MACH,
    };

    await expect(
      assertClearingActorForClear(
        evidence,
        clearInput({
          sessionAssurance: { authenticationMethod: "Passkey", authFactors: [] },
        }),
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied });

    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        projectId: PRJ,
        denial: { reasonCode: HIGH_ASSURANCE_ERROR_CODES.clearingDenied },
      }),
    );
  });

  it("denies clear when effective access organization mismatches bounded operation", async () => {
    const evidence = {
      ...baseEvidence({ expiresAt: "2026-07-03T00:15:00.000Z" }),
      requestingUserId: undefined,
      requestingMachineIdentityId: MACH,
    };

    await expect(
      assertClearingActorForClear(
        evidence,
        clearInput({
          sessionAssurance: { authenticationMethod: "Passkey", authFactors: [] },
          requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
          clearingUserAccess: {
            organizationId: ORG_OTHER,
            scopes: [AUTHORIZATION_SCOPES.approvalApprove],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });
  });

  it("denies durable consume retry for machine-origin evidence without scopes and access", async () => {
    const consumedEvidence = {
      ...machineClearedEvidence(),
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    getOperation.mockResolvedValue(operationWithEvidence(consumedEvidence, "running"));

    await expect(
      consumeHighAssuranceEvidence({
        organizationId: ORG,
        operationId: OP,
        clearingUserId: USER_A,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied });

    expect(recordHighAssuranceEvidenceConsumed).not.toHaveBeenCalled();
    expect(recordHighAssuranceEvidenceConsumeDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
        reasonCode: HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      }),
    );
  });
});

describe("request challenge flow regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAuditEventId.mockReturnValue(AUD_REQUEST);
    recordHighAssuranceChallengeRequested.mockResolvedValue({ auditEventId: AUD_REQUEST });
    getOperation.mockResolvedValue({
      operationId: OP,
      organizationId: ORG,
      state: "running",
      intentCode: "sync.run",
      progress: {},
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
    });
  });

  it("persists request evidence before writing request success audit", async () => {
    const durableOperation = operationWithEvidence(baseEvidence(), "waiting_for_human");
    transitionOperation.mockResolvedValue({ operation: durableOperation, created: false });

    await requestHighAssuranceChallenge({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
      requestingUserId: USER_A,
    });

    expect(transitionOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "waiting_for_human",
        progress: expect.objectContaining({
          highAssuranceChallenge: expect.objectContaining({
            requestAuditEventId: AUD_REQUEST,
          }),
          auditEventIds: [AUD_REQUEST],
        }),
      }),
    );
    expect(transitionOperation).toHaveBeenCalledBefore(recordHighAssuranceChallengeRequested);
    expect(recordHighAssuranceChallengeRequested).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_REQUEST, requestingUserId: USER_A }),
    );
  });

  it("does not record request success audit when transition fails", async () => {
    transitionOperation.mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.staleTransition, "stale transition", true),
    );

    await expect(
      requestHighAssuranceChallenge({
        organizationId: ORG,
        projectId: PRJ,
        operationId: OP,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
        requestingMachineIdentityId: MACH,
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);

    expect(recordHighAssuranceChallengeRequested).not.toHaveBeenCalled();
    expect(writeAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: MACH },
      }),
    );
  });

  it("retries request audit finalization when durable evidence already persisted", async () => {
    const pendingOperation = {
      operationId: OP,
      organizationId: ORG,
      state: "running" as const,
      intentCode: "sync.run",
      progress: {},
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-03T00:00:00.000Z",
    };
    const durableOperation = operationWithEvidence(baseEvidence(), "waiting_for_human");
    getOperation.mockResolvedValueOnce(pendingOperation).mockResolvedValueOnce(durableOperation);
    transitionOperation.mockResolvedValue({ operation: durableOperation, created: false });
    recordHighAssuranceChallengeRequested.mockRejectedValueOnce(
      new Error("audit store unavailable"),
    );
    recordHighAssuranceChallengeRequested.mockResolvedValueOnce({ auditEventId: AUD_REQUEST });

    await expect(
      requestHighAssuranceChallenge({
        organizationId: ORG,
        projectId: PRJ,
        operationId: OP,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
        requestingUserId: USER_A,
      }),
    ).rejects.toThrow("audit store unavailable");

    const result = await requestHighAssuranceChallenge({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
      requestingUserId: USER_A,
    });

    expect(transitionOperation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ operation: durableOperation, created: false });
    expect(recordHighAssuranceChallengeRequested).toHaveBeenLastCalledWith(
      expect.objectContaining({ auditEventId: AUD_REQUEST }),
    );
  });

  it("derives durable request retry audit scope and actor from bound evidence", async () => {
    const machineEvidence = {
      ...baseEvidence(),
      requestingUserId: undefined,
      requestingMachineIdentityId: MACH,
    };
    getOperation.mockResolvedValue(operationWithEvidence(machineEvidence, "waiting_for_human"));

    await requestHighAssuranceChallenge({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
      requestingMachineIdentityId: MACH,
    });

    expect(transitionOperation).not.toHaveBeenCalled();
    expect(recordHighAssuranceChallengeRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
        requestingMachineIdentityId: MACH,
        auditEventId: AUD_REQUEST,
      }),
    );
    expect(recordHighAssuranceChallengeRequested).toHaveBeenCalledWith(
      expect.not.objectContaining({
        requestingUserId: expect.anything(),
      }),
    );
  });

  it("creates fresh challenge evidence after prior evidence was consumed", async () => {
    const consumedEvidence = {
      ...clearedEvidence(),
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const runningOperation = operationWithEvidence(consumedEvidence, "running");
    const waitingOperation = operationWithEvidence(baseEvidence(), "waiting_for_human");

    getOperation.mockResolvedValue(runningOperation);
    transitionOperation.mockResolvedValue({ operation: waitingOperation, created: false });

    await requestHighAssuranceChallenge({
      organizationId: ORG,
      projectId: PRJ,
      operationId: OP,
      riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
      requestingUserId: USER_A,
    });

    const transitionCall = transitionOperation.mock.calls[0]?.[0];
    expect(transitionCall).toBeDefined();

    const mergedProgress = mergeOperationProgress(
      runningOperation.progress,
      transitionCall?.progress ?? {},
    );
    const storedEvidence = mergedProgress.highAssuranceChallenge;

    expect(storedEvidence).toEqual(
      expect.objectContaining({
        requestAuditEventId: AUD_REQUEST,
        challengeId: expect.not.stringMatching(consumedEvidence.challengeId),
      }),
    );
    expect(storedEvidence).not.toHaveProperty("clearedAt");
    expect(storedEvidence).not.toHaveProperty("clearingUserId");
    expect(storedEvidence).not.toHaveProperty("clearAuthenticationMethodCode");
    expect(storedEvidence).not.toHaveProperty("clearAuditEventId");
    expect(storedEvidence).not.toHaveProperty("consumedAt");
    expect(storedEvidence).not.toHaveProperty("consumeAuditEventId");
    expect(
      resolveHighAssuranceChallengeStatus({
        operationId: OP,
        highAssuranceChallenge: storedEvidence,
      }),
    ).toMatchObject({
      state: "pending",
      hasClearedEvidence: false,
    });

    expect(transitionOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "waiting_for_human",
        progress: expect.objectContaining({
          highAssuranceChallenge: expect.objectContaining({
            requestAuditEventId: AUD_REQUEST,
            challengeId: expect.not.stringMatching(consumedEvidence.challengeId),
          }),
        }),
      }),
    );
    expect(recordHighAssuranceChallengeRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        auditEventId: AUD_REQUEST,
        challengeId: expect.not.stringMatching(consumedEvidence.challengeId),
      }),
    );
  });

  it("rejects durable request retry when caller input mismatches bound evidence", async () => {
    const machineEvidence = {
      ...baseEvidence(),
      requestingUserId: undefined,
      requestingMachineIdentityId: MACH,
    };
    getOperation.mockResolvedValue(operationWithEvidence(machineEvidence, "waiting_for_human"));

    await expect(
      requestHighAssuranceChallenge({
        organizationId: ORG,
        projectId: PRJ_OTHER,
        operationId: OP,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
        requestingMachineIdentityId: MACH,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(recordHighAssuranceChallengeRequested).not.toHaveBeenCalled();

    await expect(
      requestHighAssuranceChallenge({
        organizationId: ORG,
        projectId: PRJ,
        operationId: OP,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.protectedPromotion,
        requestingMachineIdentityId: MACH,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(recordHighAssuranceChallengeRequested).not.toHaveBeenCalled();

    await expect(
      requestHighAssuranceChallenge({
        organizationId: ORG,
        projectId: PRJ,
        operationId: OP,
        riskReasonCode: HIGH_ASSURANCE_RISK_REASON_CODES.agentStepUp,
        requestingMachineIdentityId: machineIdentityId.brand("mach_00000000000000000000000002"),
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.actorMismatch });

    expect(recordHighAssuranceChallengeRequested).not.toHaveBeenCalled();
  });
});

describe("clear challenge flow regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAuditEventId.mockReturnValue(AUD_CLEAR);
    recordHighAssuranceChallengeCleared.mockResolvedValue({ auditEventId: AUD_CLEAR });
    getOperation.mockResolvedValue(
      operationWithEvidence(baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" })),
    );
  });

  it("persists cleared evidence before writing clear success audit", async () => {
    const pending = baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const cleared = {
      ...pending,
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: AUD_CLEAR,
    };
    recordOperationProgress.mockResolvedValue({
      operation: operationWithEvidence(cleared),
      created: false,
    });

    await clearHighAssuranceChallenge(clearInput());

    expect(recordOperationProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: expect.objectContaining({
          highAssuranceChallenge: expect.objectContaining({
            clearAuditEventId: AUD_CLEAR,
          }),
          auditEventIds: [AUD_CLEAR],
        }),
      }),
    );
    expect(recordOperationProgress).toHaveBeenCalledBefore(recordHighAssuranceChallengeCleared);
    expect(recordHighAssuranceChallengeCleared).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_CLEAR, clearingUserId: USER_A }),
    );
  });

  it("does not record clear success audit when progress mutation fails", async () => {
    recordOperationProgress.mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.staleTransition, "stale transition", true),
    );

    await expect(clearHighAssuranceChallenge(clearInput())).rejects.toBeInstanceOf(
      OperationStoreError,
    );

    expect(recordHighAssuranceChallengeCleared).not.toHaveBeenCalled();
  });

  it("retries clear audit finalization when durable evidence already persisted", async () => {
    const pending = baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const cleared = clearedEvidence();
    const durableOperation = operationWithEvidence({
      ...cleared,
      clearAuditEventId: AUD_CLEAR,
    });
    getOperation
      .mockResolvedValueOnce(operationWithEvidence(pending))
      .mockResolvedValueOnce(durableOperation);
    recordOperationProgress.mockResolvedValue({ operation: durableOperation, created: false });
    recordHighAssuranceChallengeCleared.mockRejectedValueOnce(new Error("audit store unavailable"));
    recordHighAssuranceChallengeCleared.mockResolvedValueOnce({ auditEventId: AUD_CLEAR });

    await expect(clearHighAssuranceChallenge(clearInput())).rejects.toThrow(
      "audit store unavailable",
    );

    const result = await clearHighAssuranceChallenge(clearInput());

    expect(recordOperationProgress).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ operation: durableOperation, created: false });
    expect(recordHighAssuranceChallengeCleared).toHaveBeenLastCalledWith(
      expect.objectContaining({ auditEventId: AUD_CLEAR, clearingUserId: USER_A }),
    );
  });

  it("retries clear audit finalization when operation already moved to running", async () => {
    const cleared = clearedEvidence();
    const runningOperation = operationWithEvidence(
      {
        ...cleared,
        clearAuditEventId: AUD_CLEAR,
        consumedAt: "2026-07-03T00:10:00.000Z",
        consumeAuditEventId: AUD_CONSUME,
      },
      "running",
    );
    getOperation.mockResolvedValue(runningOperation);

    const result = await clearHighAssuranceChallenge(clearInput());

    expect(recordOperationProgress).not.toHaveBeenCalled();
    expect(result).toEqual({ operation: runningOperation, created: false });
    expect(recordHighAssuranceChallengeCleared).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_CLEAR, clearingUserId: USER_A }),
    );
  });
});

describe("consume evidence flow regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAuditEventId.mockReturnValue(AUD_CONSUME);
    recordHighAssuranceEvidenceConsumed.mockResolvedValue({
      auditEventId: AUD_CONSUME,
    });
  });

  it("persists consumed metadata and audit linkage in one transition", async () => {
    const evidence = clearedEvidence();
    const operation = operationWithEvidence(evidence);
    getOperation.mockResolvedValue(operation);
    transitionOperation.mockResolvedValue({
      operation: operationWithEvidence(
        {
          ...evidence,
          consumedAt: "2026-07-03T00:10:00.000Z",
          consumeAuditEventId: AUD_CONSUME,
        },
        "running",
      ),
      created: false,
    });

    await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(transitionOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: "running",
        progress: expect.objectContaining({
          highAssuranceChallenge: expect.objectContaining({
            consumedAt: expect.any(String),
            consumeAuditEventId: AUD_CONSUME,
          }),
          auditEventIds: [AUD_CONSUME],
        }),
      }),
    );
    expect(transitionOperation).toHaveBeenCalledBefore(recordHighAssuranceEvidenceConsumed);
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PRJ, auditEventId: AUD_CONSUME }),
    );
  });

  it("does not record consume success audit when transition fails", async () => {
    const evidence = clearedEvidence();
    getOperation.mockResolvedValue(operationWithEvidence(evidence));
    transitionOperation.mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.staleTransition, "stale transition", true),
    );

    await expect(
      consumeHighAssuranceEvidence({
        organizationId: ORG,
        operationId: OP,
        clearingUserId: USER_A,
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);

    expect(recordHighAssuranceEvidenceConsumed).not.toHaveBeenCalled();
    expect(recordHighAssuranceEvidenceConsumeDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
        reasonCode: HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
      }),
    );
  });

  it("retries audit finalization when durable consume already persisted", async () => {
    const evidence = clearedEvidence();
    const consumedEvidence = {
      ...evidence,
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const durableOperation = operationWithEvidence(consumedEvidence, "running");

    getOperation.mockResolvedValue(durableOperation);
    recordHighAssuranceEvidenceConsumed.mockRejectedValueOnce(new Error("audit store unavailable"));
    recordHighAssuranceEvidenceConsumed.mockResolvedValueOnce({ auditEventId: AUD_CONSUME });

    await expect(
      consumeHighAssuranceEvidence({
        organizationId: ORG,
        operationId: OP,
        clearingUserId: USER_A,
      }),
    ).rejects.toThrow("audit store unavailable");

    getOperation.mockResolvedValue(durableOperation);

    const result = await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(transitionOperation).not.toHaveBeenCalled();
    expect(result).toEqual({ operation: durableOperation, created: false });
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenLastCalledWith(
      expect.objectContaining({ auditEventId: AUD_CONSUME, clearingUserId: USER_A }),
    );
  });

  it("finalizes missing clear audit when consume succeeded after clear audit failure", async () => {
    const pending = baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const cleared = {
      ...pending,
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: AUD_CLEAR,
    };
    const consumed = {
      ...cleared,
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const waitingAfterClear = operationWithEvidence(cleared);
    const runningAfterConsume = operationWithEvidence(consumed, "running");

    getOperation
      .mockResolvedValueOnce(operationWithEvidence(pending))
      .mockResolvedValueOnce(waitingAfterClear)
      .mockResolvedValueOnce(runningAfterConsume);
    generateAuditEventId.mockReturnValueOnce(AUD_CLEAR).mockReturnValue(AUD_CONSUME);
    recordOperationProgress.mockResolvedValue({
      operation: waitingAfterClear,
      created: false,
    });
    recordHighAssuranceChallengeCleared.mockRejectedValueOnce(new Error("audit store unavailable"));
    recordHighAssuranceChallengeCleared.mockResolvedValue({ auditEventId: AUD_CLEAR });
    transitionOperation.mockResolvedValue({
      operation: runningAfterConsume,
      created: false,
    });

    await expect(clearHighAssuranceChallenge(clearInput())).rejects.toThrow(
      "audit store unavailable",
    );

    await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(recordHighAssuranceChallengeCleared).toHaveBeenCalledTimes(2);
    expect(recordHighAssuranceChallengeCleared).toHaveBeenLastCalledWith(
      expect.objectContaining({ auditEventId: AUD_CLEAR, clearingUserId: USER_A }),
    );
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_CONSUME }),
    );

    getOperation.mockResolvedValue(runningAfterConsume);
    recordHighAssuranceEvidenceConsumed.mockClear();

    const result = await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(transitionOperation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ operation: runningAfterConsume, created: false });
    expect(recordHighAssuranceChallengeCleared).toHaveBeenCalledTimes(3);
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_CONSUME, clearingUserId: USER_A }),
    );
  });

  it("finalizes missing request audit during durable consume retry", async () => {
    const cleared = {
      ...baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" }),
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: USER_A,
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: auditEventId.brand("aud_00000000000000000000000002"),
    };
    const consumed = {
      ...cleared,
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const runningOperation = operationWithEvidence(consumed, "running");

    getOperation.mockResolvedValue(runningOperation);
    recordHighAssuranceChallengeRequested.mockResolvedValue({ auditEventId: AUD_REQUEST });
    recordHighAssuranceChallengeCleared.mockResolvedValue({
      auditEventId: cleared.clearAuditEventId,
    });
    recordHighAssuranceEvidenceConsumed.mockResolvedValue({ auditEventId: AUD_CONSUME });

    await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(recordHighAssuranceChallengeRequested).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_REQUEST }),
    );
    expect(recordHighAssuranceChallengeCleared).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: cleared.clearAuditEventId }),
    );
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_CONSUME }),
    );
  });

  it("denies durable consume retry for actor-mismatched clearing user", async () => {
    const consumedEvidence = {
      ...clearedEvidence(),
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const durableOperation = operationWithEvidence(consumedEvidence, "running");
    getOperation.mockResolvedValue(durableOperation);

    await expect(
      consumeHighAssuranceEvidence({
        organizationId: ORG,
        operationId: OP,
        clearingUserId: USER_B,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.actorMismatch });

    expect(recordHighAssuranceEvidenceConsumed).not.toHaveBeenCalled();
    expect(recordHighAssuranceEvidenceConsumeDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
        reasonCode: HIGH_ASSURANCE_ERROR_CODES.actorMismatch,
      }),
    );
  });

  it("denies durable consume retry when caller lacks required scopes", async () => {
    const consumedEvidence = {
      ...clearedEvidence(),
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const durableOperation = operationWithEvidence(consumedEvidence, "running");
    getOperation.mockResolvedValue(durableOperation);

    await expect(
      consumeHighAssuranceEvidence({
        organizationId: ORG,
        operationId: OP,
        clearingUserId: USER_A,
        requiredScopes: [AUTHORIZATION_SCOPES.approvalApprove],
        clearingUserAccess: { organizationId: ORG, scopes: [] },
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.clearingDenied });

    expect(recordHighAssuranceEvidenceConsumed).not.toHaveBeenCalled();
    expect(recordHighAssuranceEvidenceConsumeDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PRJ,
        reasonCode: HIGH_ASSURANCE_ERROR_CODES.clearingDenied,
      }),
    );
  });
});

describe("request transition denial mapping", () => {
  it("maps OperationStoreError codes for request transition denials", () => {
    expect(
      mapOperationStoreErrorToDenialReason(
        new OperationStoreError(OPERATION_ERROR_CODES.invalidTransition, "invalid transition"),
      ),
    ).toBe(OPERATION_ERROR_CODES.invalidTransition);
    expect(mapOperationStoreErrorToDenialReason(new Error("other"))).toBe(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
    );
  });
});
