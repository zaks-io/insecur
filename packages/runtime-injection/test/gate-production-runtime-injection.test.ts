import {
  PRODUCTION_DELIVERY_PATHS,
  STORAGE_GATE_ERROR_CODES,
} from "@insecur/storage-security-gate";
import { environmentId, organizationId, projectId, userId } from "@insecur/domain";
import { RUNTIME_POLICY_ERROR_CODES } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertProductionRuntimeInjectionGate,
  assertProductionRuntimeInjectionIssueGate,
} from "../src/gate-production-runtime-injection.js";
import {
  createBlockedProductionGateEvaluator,
  createPassedProductionGateEvaluator,
} from "./gate-test-helpers.js";

const COORDINATE = {
  organizationId: organizationId.brand("org_00000000000000000000000001"),
  projectId: projectId.brand("prj_00000000000000000000000001"),
  environmentId: environmentId.brand("env_00000000000000000000000001"),
};

let protectedEnvironment = false;

vi.mock("../src/load-runtime-injection-environment-context.js", () => ({
  loadRuntimeInjectionEnvironmentContext: vi.fn(async () => ({
    isProtected: protectedEnvironment,
    lifecycleStage: protectedEnvironment ? "preview" : "development",
  })),
}));

beforeEach(() => {
  protectedEnvironment = false;
});

describe("assertProductionRuntimeInjectionGate", () => {
  it("skips the storage gate for the First Value delivery path", async () => {
    const context = await assertProductionRuntimeInjectionGate({
      actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
      coordinate: COORDINATE,
      deliveryPath: "first_value.local_runtime_injection",
    });

    expect(context.gateVerdict).toBeUndefined();
    expect(context.deliveryPath).toBe("first_value.local_runtime_injection");
  });

  it("throws storage.gate_blocked before protected delivery continues", async () => {
    protectedEnvironment = true;

    await expect(
      assertProductionRuntimeInjectionIssueGate({
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        coordinate: COORDINATE,
        deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
        evaluateStorageSecurityGate: createBlockedProductionGateEvaluator(),
      }),
    ).rejects.toMatchObject({ code: STORAGE_GATE_ERROR_CODES.gateBlocked });
  });

  it("blocks protected issue for human sessions after a passed gate", async () => {
    protectedEnvironment = true;

    await expect(
      assertProductionRuntimeInjectionIssueGate({
        actor: { type: "user", userId: userId.brand("usr_00000000000000000000000001") },
        coordinate: COORDINATE,
        deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
        evaluateStorageSecurityGate: createPassedProductionGateEvaluator(),
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.protectedUseBlocked });
  });
});
