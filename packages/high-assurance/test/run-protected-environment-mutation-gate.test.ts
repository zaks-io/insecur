import {
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { isProtectedEnvironment } = vi.hoisted(() => ({
  isProtectedEnvironment: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  isProtectedEnvironment,
}));

vi.mock("@insecur/operations", () => ({
  createOperation: vi.fn(),
}));

vi.mock("../src/request-high-assurance-challenge.js", () => ({
  requestHighAssuranceChallenge: vi.fn(),
}));

import { createOperation } from "@insecur/operations";
import { requestHighAssuranceChallenge } from "../src/request-high-assurance-challenge.js";
import {
  HighAssuranceHandoffError,
  protectedEnvironmentMutationGateInput,
  runProtectedEnvironmentMutationGate,
} from "../src/index.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000099");

const GATE_SCOPE = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  actorUserId: USER,
  requestId: REQ,
};

describe("runProtectedEnvironmentMutationGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isProtectedEnvironment.mockResolvedValue(true);
  });

  it("skips gating for non-protected environments", async () => {
    isProtectedEnvironment.mockResolvedValue(false);
    const consumeEvidence = vi.fn();

    await expect(
      runProtectedEnvironmentMutationGate({
        ...GATE_SCOPE,
        intentCode: "protected_promotion.request",
        riskReasonCode: "protected_promotion",
        consumeEvidence,
      }),
    ).resolves.toEqual({});

    expect(consumeEvidence).not.toHaveBeenCalled();
  });

  it("hands off when operationId is absent", async () => {
    vi.mocked(createOperation).mockResolvedValue({
      operation: { operationId: OP },
    } as never);
    vi.mocked(requestHighAssuranceChallenge).mockResolvedValue(undefined);

    const consumeEvidence = vi.fn();

    await expect(
      runProtectedEnvironmentMutationGate({
        ...GATE_SCOPE,
        intentCode: "protected_promotion.request",
        riskReasonCode: "protected_promotion",
        consumeEvidence,
      }),
    ).rejects.toBeInstanceOf(HighAssuranceHandoffError);

    expect(consumeEvidence).not.toHaveBeenCalled();
  });

  it("consumes evidence when operationId is present", async () => {
    const consumeEvidence = vi.fn().mockResolvedValue(undefined);

    await expect(
      runProtectedEnvironmentMutationGate({
        ...GATE_SCOPE,
        operationId: OP,
        intentCode: "protected_promotion.request",
        riskReasonCode: "protected_promotion",
        consumeEvidence,
      }),
    ).resolves.toEqual({ operationId: OP });

    expect(consumeEvidence).toHaveBeenCalledWith(OP);
  });
});

describe("protectedEnvironmentMutationGateInput", () => {
  it("threads intent, risk reason, and consume callback", () => {
    const consumeEvidence = vi.fn();
    const input = protectedEnvironmentMutationGateInput(
      GATE_SCOPE,
      { intentCode: "intent", riskReasonCode: "risk" },
      consumeEvidence,
    );

    expect(input).toMatchObject({
      organizationId: ORG,
      intentCode: "intent",
      riskReasonCode: "risk",
      consumeEvidence,
    });
  });
});
