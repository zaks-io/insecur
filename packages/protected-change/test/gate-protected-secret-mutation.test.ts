import {
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/operations", () => ({
  OPERATION_INTENT_CODES: {
    protectedPromotionRequest: "protected_promotion.request",
    protectedRollbackRequest: "protected_rollback.request",
  },
}));

vi.mock("@insecur/high-assurance", () => ({
  HIGH_ASSURANCE_RISK_REASON_CODES: {
    protectedPromotion: "protected_promotion",
    protectedRollback: "protected_rollback",
  },
  protectedEnvironmentMutationGateInput: vi.fn((input, config, consumeEvidence) => ({
    ...input,
    ...config,
    consumeEvidence,
  })),
  runProtectedEnvironmentMutationGate: vi.fn(),
}));

vi.mock("../src/consume-protected-secret-mutation-evidence.js", () => ({
  consumeProtectedSecretMutationEvidence: vi.fn().mockResolvedValue(undefined),
}));

import { runProtectedEnvironmentMutationGate } from "@insecur/high-assurance";
import { gateProtectedSecretMutation } from "../src/gate-protected-secret-mutation.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000099");

const GATE_INPUT = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  actorUserId: USER,
  requestId: REQ,
  mutationKind: "promotion" as const,
  onDenied: vi.fn(async () => undefined),
};

describe("gateProtectedSecretMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates promotion mutations to the protected environment gate", async () => {
    vi.mocked(runProtectedEnvironmentMutationGate).mockResolvedValue({ operationId: OP });

    await expect(gateProtectedSecretMutation(GATE_INPUT)).resolves.toEqual({ operationId: OP });

    expect(runProtectedEnvironmentMutationGate).toHaveBeenCalledWith(
      expect.objectContaining({
        intentCode: "protected_promotion.request",
        riskReasonCode: "protected_promotion",
      }),
    );
  });

  it("uses rollback intent codes for rollback mutations", async () => {
    vi.mocked(runProtectedEnvironmentMutationGate).mockResolvedValue({});

    await gateProtectedSecretMutation({ ...GATE_INPUT, mutationKind: "rollback" });

    expect(runProtectedEnvironmentMutationGate).toHaveBeenCalledWith(
      expect.objectContaining({
        intentCode: "protected_rollback.request",
        riskReasonCode: "protected_rollback",
      }),
    );
  });
});
