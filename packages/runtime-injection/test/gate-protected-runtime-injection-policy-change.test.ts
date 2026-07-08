import {
  environmentId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { HighAssuranceChallengeError, HighAssuranceHandoffError } from "@insecur/high-assurance";
import { TenantEnvironmentLifecycleStore } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireRuntimeInjectionPolicyChangeEvidence } = vi.hoisted(() => ({
  requireRuntimeInjectionPolicyChangeEvidence: vi.fn(),
}));

vi.mock("../src/consume-runtime-injection-policy-change-evidence.js", () => ({
  requireRuntimeInjectionPolicyChangeEvidence,
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, callback) => callback({ db: {} })),
  };
});

vi.mock("@insecur/operations", () => ({
  createOperation: vi.fn(),
  OPERATION_INTENT_CODES: {
    runtimeInjectionPolicyChange: "runtime_injection_policy.change",
  },
}));

vi.mock("@insecur/high-assurance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/high-assurance")>();
  return {
    ...actual,
    requestHighAssuranceChallenge: vi.fn(),
  };
});

import { createOperation } from "@insecur/operations";
import { requestHighAssuranceChallenge } from "@insecur/high-assurance";
import { gateProtectedRuntimeInjectionPolicyChange } from "../src/gate-protected-runtime-injection-policy-change.js";

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
  onDenied: vi.fn(async () => undefined),
};

describe("gateProtectedRuntimeInjectionPolicyChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    GATE_INPUT.onDenied.mockClear();
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
      isProtected: true,
    } as never);
  });

  it("hands off with operationId on the initial protected-environment path", async () => {
    vi.mocked(createOperation).mockResolvedValue({
      operation: { operationId: OP },
    } as never);
    vi.mocked(requestHighAssuranceChallenge).mockResolvedValue(undefined);

    await expect(gateProtectedRuntimeInjectionPolicyChange(GATE_INPUT)).rejects.toBeInstanceOf(
      HighAssuranceHandoffError,
    );
    await expect(gateProtectedRuntimeInjectionPolicyChange(GATE_INPUT)).rejects.toMatchObject({
      operationId: OP,
    });

    expect(requireRuntimeInjectionPolicyChangeEvidence).not.toHaveBeenCalled();
  });

  it("propagates operation-mismatch challenge errors on resume instead of re-handing off", async () => {
    const challengeError = new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
      "high-assurance evidence risk reason does not match runtime injection policy change",
    );
    requireRuntimeInjectionPolicyChangeEvidence.mockImplementation(async (_input, onDenied) => {
      await onDenied(challengeError);
      throw challengeError;
    });

    const rejection = gateProtectedRuntimeInjectionPolicyChange({
      ...GATE_INPUT,
      operationId: OP,
    });

    await expect(rejection).rejects.toBeInstanceOf(HighAssuranceChallengeError);
    await expect(rejection).rejects.toMatchObject({
      code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch,
    });
    await expect(rejection).rejects.not.toBeInstanceOf(HighAssuranceHandoffError);

    expect(requireRuntimeInjectionPolicyChangeEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        operationId: OP,
      }),
      GATE_INPUT.onDenied,
    );
    expect(GATE_INPUT.onDenied).toHaveBeenCalled();
  });

  it("skips gating for non-protected environments", async () => {
    vi.spyOn(TenantEnvironmentLifecycleStore.prototype, "getById").mockResolvedValue({
      isProtected: false,
    } as never);

    await expect(
      gateProtectedRuntimeInjectionPolicyChange({
        ...GATE_INPUT,
        operationId: OP,
      }),
    ).resolves.toEqual({});

    expect(requireRuntimeInjectionPolicyChangeEvidence).not.toHaveBeenCalled();
  });
});
