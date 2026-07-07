import { AUTHORIZATION_SCOPES } from "@insecur/access";
import {
  environmentId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type { OperationPollResult } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeRuntimeInjectionPolicyChangeEvidence,
  requireRuntimeInjectionPolicyChangeEvidence,
} from "../src/consume-runtime-injection-policy-change-evidence.js";
import * as highAssurance from "@insecur/high-assurance";
import {
  HighAssuranceChallengeError,
  HIGH_ASSURANCE_RISK_REASON_CODES,
} from "@insecur/high-assurance";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV_A = environmentId.brand("env_00000000000000000000000001");
const ENV_B = environmentId.brand("env_00000000000000000000000002");
const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };

const { getOperation, transitionOperationConsumeHighAssuranceEvidence } = vi.hoisted(() => ({
  getOperation: vi.fn(),
  transitionOperationConsumeHighAssuranceEvidence: vi.fn(),
}));

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation,
    transitionOperationConsumeHighAssuranceEvidence,
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
    generateAuditEventId: vi.fn().mockReturnValue("aud_test_consume"),
  };
});

function operationWithRiskReason(
  riskReasonCode: string,
  boundEnvironmentId: typeof ENV_A,
): OperationPollResult {
  return {
    operationId: OP,
    organizationId: ORG,
    state: "waiting_for_human",
    intentCode: "runtime_injection_policy.change",
    progress: {
      highAssuranceChallenge: {
        challengeId: "challenge_test_token_001",
        riskReasonCode,
        projectId: PROJECT,
        environmentId: boundEnvironmentId,
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

describe("consumeRuntimeInjectionPolicyChangeEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOperation.mockResolvedValue(
      operationWithRiskReason(
        HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
        ENV_A,
      ),
    );
    transitionOperationConsumeHighAssuranceEvidence.mockResolvedValue({
      operation: operationWithRiskReason(
        HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
        ENV_A,
      ),
      created: true,
    });
  });

  it("consumes cleared evidence with environment-bound high-assurance input", async () => {
    const boundOperation = operationWithRiskReason(
      HIGH_ASSURANCE_RISK_REASON_CODES.protectedRuntimeInjectionPolicy,
      ENV_A,
    );
    const consumeSpy = vi.spyOn(highAssurance, "consumeHighAssuranceEvidence").mockResolvedValue({
      operation: boundOperation,
      created: false,
    });

    await consumeRuntimeInjectionPolicyChangeEvidence({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV_A,
      operationId: OP,
      actor: ACTOR,
    });

    expect(consumeSpy).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV_A,
      operationId: OP,
      resumingUserId: ACTOR.userId,
      clearingUserId: ACTOR.userId,
      requiredScopes: [AUTHORIZATION_SCOPES.projectConfigure],
    });

    consumeSpy.mockRestore();
  });

  it("rejects cross-environment resume when evidence was cleared for a different env", async () => {
    await expect(
      consumeRuntimeInjectionPolicyChangeEvidence({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV_B,
        operationId: OP,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });

    expect(transitionOperationConsumeHighAssuranceEvidence).not.toHaveBeenCalled();
  });

  it("records denial and rethrows when high-assurance evidence is missing", async () => {
    vi.spyOn(highAssurance, "consumeHighAssuranceEvidence").mockRejectedValueOnce(
      new HighAssuranceChallengeError(
        HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
        "high-assurance challenge evidence is required",
      ),
    );

    const onDenied = vi.fn(async () => undefined);

    await expect(
      requireRuntimeInjectionPolicyChangeEvidence(
        {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV_A,
          operationId: OP,
          actor: ACTOR,
        },
        onDenied,
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.evidenceMissing });

    expect(onDenied).toHaveBeenCalledOnce();
  });
});
