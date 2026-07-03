import {
  auditEventId,
  HIGH_ASSURANCE_ERROR_CODES,
  OPERATION_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type {
  OperationHighAssuranceChallengeEvidence,
  OperationPollResult,
} from "@insecur/operations";
import { OperationStoreError } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClearHighAssuranceChallengeInput } from "../src/high-assurance-challenge-inputs.js";
import { requirePendingChallengeEvidence } from "../src/clear-high-assurance-challenge-preflight.js";
import { consumeHighAssuranceEvidence } from "../src/consume-high-assurance-evidence.js";
import { mapOperationStoreErrorToDenialReason } from "../src/map-operation-store-denial.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";
import { computeChallengeExpiresAt } from "../src/high-assurance-challenge-helpers.js";

const {
  getOperation,
  transitionOperation,
  recordOperationProgress,
  recordHighAssuranceEvidenceConsumed,
  recordHighAssuranceEvidenceConsumeDenied,
  writeAuditEvent,
} = vi.hoisted(() => ({
  getOperation: vi.fn(),
  transitionOperation: vi.fn(),
  recordOperationProgress: vi.fn(),
  recordHighAssuranceEvidenceConsumed: vi.fn(),
  recordHighAssuranceEvidenceConsumeDenied: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const PRJ_OTHER = projectId.brand("prj_00000000000000000000000002");
const OP = operationId.brand("op_00000000000000000000000001");
const USER_A = userId.brand("usr_00000000000000000000000001");
const AUD_REQUEST = auditEventId.brand("aud_00000000000000000000000001");

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
    recordHighAssuranceEvidenceConsumed,
    recordHighAssuranceEvidenceConsumeDenied,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent,
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

describe("consume evidence flow regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordHighAssuranceEvidenceConsumed.mockResolvedValue({
      auditEventId: "aud_00000000000000000000000003",
    });
    recordOperationProgress.mockResolvedValue({
      operation: operationWithEvidence(clearedEvidence(), "running"),
      created: false,
    });
  });

  it("records consume success audit only after durable transition", async () => {
    const evidence = clearedEvidence();
    const operation = operationWithEvidence(evidence);
    getOperation.mockResolvedValue(operation);
    transitionOperation.mockResolvedValue({
      operation: operationWithEvidence(
        { ...evidence, consumedAt: "2026-07-03T00:10:00.000Z" },
        "running",
      ),
      created: false,
    });

    await consumeHighAssuranceEvidence({
      organizationId: ORG,
      operationId: OP,
      clearingUserId: USER_A,
    });

    expect(transitionOperation).toHaveBeenCalledBefore(recordHighAssuranceEvidenceConsumed);
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledBefore(recordOperationProgress);
    expect(recordHighAssuranceEvidenceConsumed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PRJ }),
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
