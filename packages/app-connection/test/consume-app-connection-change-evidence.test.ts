import {
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { AUTHORIZATION_SCOPES } from "@insecur/access";
import type { OperationPollResult } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeAppConnectionChangeEvidence,
  requireAppConnectionChangeEvidence,
} from "../src/consume-app-connection-change-evidence.js";
import { HighAssuranceChallengeError } from "@insecur/high-assurance";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

const { getOperation, consumeHighAssuranceEvidence } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  consumeHighAssuranceEvidence: vi.fn(),
}));

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return { ...actual, getOperation };
});

vi.mock("@insecur/high-assurance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/high-assurance")>();
  return { ...actual, consumeHighAssuranceEvidence };
});

function operationWithRiskReason(riskReasonCode: string): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state: "waiting_for_human",
    intentCode: "sync.run",
    progress: {
      highAssuranceChallenge: {
        challengeId: "challenge_test_token_001",
        riskReasonCode,
        projectId: PROJECT,
        requestingUserId: ACTOR.userId,
        requestedAt: "2026-07-03T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        requestAuditEventId: "aud_00000000000000000000000001",
        clearedAt: "2026-07-03T00:05:00.000Z",
        clearingUserId: ACTOR.userId,
        clearAuthenticationMethodCode: "auth.assurance.passkey",
        clearAuditEventId: "aud_00000000000000000000000002",
      },
    },
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:05:00.000Z",
  };
}

describe("consumeAppConnectionChangeEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOperation.mockResolvedValue(
      operationWithRiskReason("high_assurance.risk.app_connection_change"),
    );
    consumeHighAssuranceEvidence.mockResolvedValue({
      operation: operationWithRiskReason("high_assurance.risk.app_connection_change"),
      created: false,
    });
  });

  it("consumes cleared operation-bound evidence for app connection change", async () => {
    await consumeAppConnectionChangeEvidence({
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      actor: ACTOR,
    });

    expect(consumeHighAssuranceEvidence).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: PROJECT,
      operationId: OP,
      resumingUserId: ACTOR.userId,
      clearingUserId: ACTOR.userId,
      requiredScopes: [AUTHORIZATION_SCOPES.connectionManage],
    });
  });

  it("fails closed when challenge evidence is missing", async () => {
    getOperation.mockResolvedValue({
      ...operationWithRiskReason("high_assurance.risk.app_connection_change"),
      progress: {},
    });

    await expect(
      consumeAppConnectionChangeEvidence({
        organizationId: ORG,
        projectId: PROJECT,
        operationId: OP,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(consumeHighAssuranceEvidence).not.toHaveBeenCalled();
  });

  it("fails closed when risk reason is not app connection change", async () => {
    getOperation.mockResolvedValue(operationWithRiskReason("high_assurance.risk.agent_step_up"));

    await expect(
      consumeAppConnectionChangeEvidence({
        organizationId: ORG,
        projectId: PROJECT,
        operationId: OP,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(consumeHighAssuranceEvidence).not.toHaveBeenCalled();
  });

  it("records denial and rethrows when high-assurance evidence is missing", async () => {
    consumeHighAssuranceEvidence.mockRejectedValue(
      new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
        "high-assurance challenge evidence is required",
      ),
    );
    const onDenied = vi.fn(async () => undefined);

    await expect(
      requireAppConnectionChangeEvidence(
        {
          organizationId: ORG,
          projectId: PROJECT,
          operationId: OP,
          actor: ACTOR,
        },
        onDenied,
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(onDenied).toHaveBeenCalledOnce();
  });
});
