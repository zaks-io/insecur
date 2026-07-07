import {
  auditEventId,
  HIGH_ASSURANCE_ERROR_CODES,
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
import { OperationStoreError } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { denyHighAssuranceChallenge } from "../src/deny-high-assurance-challenge.js";
import { HIGH_ASSURANCE_RISK_REASON_CODES } from "../src/high-assurance-risk-reason-codes.js";
import { computeChallengeExpiresAt } from "../src/high-assurance-challenge-helpers.js";

const AUD_REQUEST = auditEventId.brand("aud_00000000000000000000000001");
const AUD_DENY = auditEventId.brand("aud_00000000000000000000000005");

const {
  getOperation,
  cancelOperation,
  recordHighAssuranceChallengeDenied,
  recordHighAssuranceChallengeRequested,
  generateAuditEventId,
} = vi.hoisted(() => ({
  getOperation: vi.fn(),
  cancelOperation: vi.fn(),
  recordHighAssuranceChallengeDenied: vi.fn(),
  recordHighAssuranceChallengeRequested: vi.fn(),
  generateAuditEventId: vi.fn(),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PRJ = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const USER_A = userId.brand("usr_00000000000000000000000001");
const USER_B = userId.brand("usr_00000000000000000000000002");

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation,
    cancelOperation,
  };
});

vi.mock("../src/record-high-assurance-challenge-audit.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/record-high-assurance-challenge-audit.js")>();
  return {
    ...actual,
    recordHighAssuranceChallengeDenied,
    recordHighAssuranceChallengeRequested,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
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

function operationWithEvidence(
  evidence: OperationHighAssuranceChallengeEvidence,
  state: OperationPollResult["state"] = "waiting_for_human",
): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state,
    intentCode: "test.intent",
    progress: { highAssuranceChallenge: evidence },
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}

function denyInput(overrides: Partial<Parameters<typeof denyHighAssuranceChallenge>[0]> = {}) {
  return {
    organizationId: ORG,
    operationId: OP,
    denyingUserId: USER_A,
    requiredScopes: [AUTHORIZATION_SCOPES.approvalReject],
    denyingUserAccess: {
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalReject],
      projectScopes: { [PRJ]: [AUTHORIZATION_SCOPES.approvalReject] },
    },
    ...overrides,
  };
}

describe("deny high-assurance challenge flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAuditEventId.mockReturnValue(AUD_DENY);
    recordHighAssuranceChallengeDenied.mockResolvedValue({ auditEventId: AUD_DENY });
    recordHighAssuranceChallengeRequested.mockResolvedValue({ auditEventId: AUD_REQUEST });
    getOperation.mockResolvedValue(
      operationWithEvidence(baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" })),
    );
  });

  it("persists deny audit linkage in the same cancel transition before writing audit", async () => {
    const pending = baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const canceled = operationWithEvidence(
      {
        ...pending,
        denyingUserId: USER_A,
        denyAuditEventId: AUD_DENY,
      },
      "canceled",
    );
    cancelOperation.mockResolvedValue({ operation: canceled, created: false });

    await denyHighAssuranceChallenge(denyInput());

    expect(cancelOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        highAssuranceDenyCas: { challengeId: pending.challengeId },
        progress: expect.objectContaining({
          highAssuranceChallenge: expect.objectContaining({
            denyAuditEventId: AUD_DENY,
            denyingUserId: USER_A,
          }),
          auditEventIds: [AUD_DENY],
        }),
      }),
    );
    expect(cancelOperation).toHaveBeenCalledBefore(recordHighAssuranceChallengeDenied);
    expect(recordHighAssuranceChallengeDenied).toHaveBeenCalledWith(
      expect.objectContaining({ auditEventId: AUD_DENY, denyingUserId: USER_A }),
    );
  });

  it("does not record deny success audit when cancel transition fails", async () => {
    cancelOperation.mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.staleTransition, "stale transition", true),
    );

    await expect(denyHighAssuranceChallenge(denyInput())).rejects.toMatchObject({
      code: HIGH_ASSURANCE_ERROR_CODES.alreadyConsumed,
    });

    expect(recordHighAssuranceChallengeDenied).not.toHaveBeenCalled();
  });

  it("retries deny audit finalization when durable canceled evidence already persisted", async () => {
    const pending = baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" });
    const durableOperation = operationWithEvidence(
      {
        ...pending,
        denyingUserId: USER_A,
        denyAuditEventId: AUD_DENY,
      },
      "canceled",
    );
    getOperation
      .mockResolvedValueOnce(operationWithEvidence(pending))
      .mockResolvedValueOnce(durableOperation);
    cancelOperation.mockResolvedValue({ operation: durableOperation, created: false });
    recordHighAssuranceChallengeDenied.mockRejectedValueOnce(new Error("audit store unavailable"));

    await expect(denyHighAssuranceChallenge(denyInput())).rejects.toThrow(
      "audit store unavailable",
    );
    expect(cancelOperation).toHaveBeenCalledTimes(1);

    await denyHighAssuranceChallenge(denyInput());

    expect(cancelOperation).toHaveBeenCalledTimes(1);
    expect(recordHighAssuranceChallengeDenied).toHaveBeenLastCalledWith(
      expect.objectContaining({ auditEventId: AUD_DENY, denyingUserId: USER_A }),
    );
  });

  it("rejects durable deny retry from a different denying user", async () => {
    const durableOperation = operationWithEvidence(
      {
        ...baseEvidence({ expiresAt: "2027-01-01T00:00:00.000Z" }),
        denyingUserId: USER_A,
        denyAuditEventId: AUD_DENY,
      },
      "canceled",
    );
    getOperation.mockResolvedValue(durableOperation);

    await expect(
      denyHighAssuranceChallenge(denyInput({ denyingUserId: USER_B })),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.actorMismatch });

    expect(recordHighAssuranceChallengeDenied).not.toHaveBeenCalled();
  });
});
