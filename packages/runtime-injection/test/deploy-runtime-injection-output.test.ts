import {
  INJECTION_ERROR_CODES,
  STORAGE_GATE_ERROR_CODES,
  type AuditEventId,
  type EnvironmentId,
  type OperationId,
  type ProjectId,
  type RuntimePolicyId,
} from "@insecur/domain";
import {
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  PRODUCTION_DELIVERY_PATHS,
} from "@insecur/storage-security-gate";
import { describe, expect, it } from "vitest";

import {
  buildDeployRuntimeInjectionOutput,
  buildDeployRuntimeInjectionOutputFromGateContext,
  type DeployRuntimeInjectionGateContextLike,
  type DeployRuntimeInjectionTarget,
} from "../src/deploy-runtime-injection-output.js";

const OPERATION_ID = "op_01JZ8E4D7G2K8M5N0P3R6T9V1X" as OperationId;
const PROJECT_ID = "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X" as ProjectId;
const ENVIRONMENT_ID = "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V" as EnvironmentId;
const POLICY_ID = "rp_01JZ8E7K0N4P6T9V2X5Z8C1D3F" as RuntimePolicyId;
const AUDIT_ID = "aud_01JZ8E9P8S3V6X0Z2C5D8F1G4H" as AuditEventId;

const productionTarget: DeployRuntimeInjectionTarget = {
  projectId: PROJECT_ID,
  environmentId: ENVIRONMENT_ID,
  isProtected: true,
  lifecycleStage: "production",
  deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
  runtimePolicyId: POLICY_ID,
};

describe("buildDeployRuntimeInjectionOutput", () => {
  it("produces a succeeded outcome for a succeeded operation", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "succeeded",
      target: productionTarget,
      gate: {
        status: "passed",
        deliveryBlocking: false,
        checkedAt: "2026-07-09T00:00:00.000Z",
        blockedControlIds: [],
      },
      auditEventIds: [AUDIT_ID],
    });

    expect(output.outcome).toBe("succeeded");
    expect(output.operationId).toBe(OPERATION_ID);
    expect(output.auditEventIds).toEqual([AUDIT_ID]);
    expect(output.reasonCode).toBeUndefined();
  });

  it("reports completed_with_warnings as a succeeded outcome carrying warnings", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "completed_with_warnings",
      target: productionTarget,
      warnings: [
        { code: STORAGE_GATE_ERROR_CODES.gateUnknown, controlIds: ["storage.root_key_escrow"] },
      ],
    });

    expect(output.outcome).toBe("succeeded");
    expect(output.warnings).toHaveLength(1);
    expect(output.warnings[0]?.code).toBe(STORAGE_GATE_ERROR_CODES.gateUnknown);
  });

  it("maps a blocked operation to a denied outcome with a reason code", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "blocked",
      target: productionTarget,
      reasonCode: STORAGE_GATE_ERROR_CODES.gateBlocked,
      gate: {
        status: "blocked",
        deliveryBlocking: true,
        checkedAt: "2026-07-09T00:00:00.000Z",
        blockedControlIds: ["storage.root_key", "storage.no_plaintext_persistence"],
      },
    });

    expect(output.outcome).toBe("denied");
    expect(output.reasonCode).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
    expect(output.gate?.blockedControlIds).toContain("storage.root_key");
  });

  it("maps a failed operation to a failed outcome", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "failed",
      target: productionTarget,
      reasonCode: INJECTION_ERROR_CODES.decryptFailed,
    });

    expect(output.outcome).toBe("failed");
    expect(output.reasonCode).toBe(INJECTION_ERROR_CODES.decryptFailed);
  });

  it("defaults warnings and audit event ids to empty arrays", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "succeeded",
      target: productionTarget,
    });

    expect(output.warnings).toEqual([]);
    expect(output.auditEventIds).toEqual([]);
  });

  it("stays JSON-stable for CI consumption (no undefined optionals serialized)", () => {
    const output = buildDeployRuntimeInjectionOutput({
      operationId: OPERATION_ID,
      operationState: "blocked",
      target: {
        projectId: PROJECT_ID,
        environmentId: ENVIRONMENT_ID,
        isProtected: true,
        lifecycleStage: "production",
        deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
      },
      reasonCode: STORAGE_GATE_ERROR_CODES.gateBlocked,
    });

    expect(JSON.parse(JSON.stringify(output))).toEqual({
      operationId: OPERATION_ID,
      operationState: "blocked",
      outcome: "denied",
      target: {
        projectId: PROJECT_ID,
        environmentId: ENVIRONMENT_ID,
        isProtected: true,
        lifecycleStage: "production",
        deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
      },
      reasonCode: STORAGE_GATE_ERROR_CODES.gateBlocked,
      warnings: [],
      auditEventIds: [],
    });
  });

  it("rejects a Sensitive Value smuggled through a warning control id", () => {
    expect(() =>
      buildDeployRuntimeInjectionOutput({
        operationId: OPERATION_ID,
        operationState: "completed_with_warnings",
        target: productionTarget,
        warnings: [
          {
            code: STORAGE_GATE_ERROR_CODES.gateUnknown,
            controlIds: ["super secret password value that is prose"],
          },
        ],
      }),
    ).toThrow(/metadata-safe/u);
  });

  it("fails loud when a blocking gate would render a succeeded outcome (no fail-open)", () => {
    expect(() =>
      buildDeployRuntimeInjectionOutput({
        operationId: OPERATION_ID,
        operationState: "succeeded",
        target: productionTarget,
        gate: {
          status: "blocked",
          deliveryBlocking: true,
          checkedAt: "2026-07-09T00:00:00.000Z",
          blockedControlIds: ["storage.root_key"],
        },
      }),
    ).toThrow(/inconsistent/u);
  });

  it("fails loud when an unknown gate status would render a succeeded outcome", () => {
    expect(() =>
      buildDeployRuntimeInjectionOutput({
        operationId: OPERATION_ID,
        operationState: "completed_with_warnings",
        target: productionTarget,
        gate: {
          status: "unknown",
          deliveryBlocking: false,
          checkedAt: "2026-07-09T00:00:00.000Z",
          blockedControlIds: ["storage.key_versions"],
        },
      }),
    ).toThrow(/inconsistent/u);
  });
});

describe("buildDeployRuntimeInjectionOutputFromGateContext", () => {
  const blockedContext: DeployRuntimeInjectionGateContextLike = {
    deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
    environment: { isProtected: true, lifecycleStage: "production" },
    gateVerdict: {
      status: "blocked",
      delivery_blocking: true,
      checked_at: "2026-07-09T00:00:00.000Z",
      error: STORAGE_GATE_ERROR_CODES.gateBlocked,
      controls: [
        { id: "storage.root_key", status: "blocked" },
        { id: "storage.tenant_store", status: "passed" },
        { id: "storage.key_version_binding", status: "unknown" },
      ],
    },
  };

  it("derives a denied output and gate summary from a blocked verdict", () => {
    const output = buildDeployRuntimeInjectionOutputFromGateContext({
      operationId: OPERATION_ID,
      operationState: "blocked",
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      context: blockedContext,
      runtimePolicyId: POLICY_ID,
      auditEventIds: [AUDIT_ID],
    });

    expect(output.outcome).toBe("denied");
    expect(output.reasonCode).toBe(STORAGE_GATE_ERROR_CODES.gateBlocked);
    expect(output.gate?.status).toBe("blocked");
    expect(output.gate?.blockedControlIds).toEqual([
      "storage.root_key",
      "storage.key_version_binding",
    ]);
    expect(output.target.runtimePolicyId).toBe(POLICY_ID);
  });

  it("omits the gate summary when the local carve-out path skips the gate", () => {
    const output = buildDeployRuntimeInjectionOutputFromGateContext({
      operationId: OPERATION_ID,
      operationState: "succeeded",
      projectId: PROJECT_ID,
      environmentId: ENVIRONMENT_ID,
      context: {
        deliveryPath: FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
        environment: { isProtected: false, lifecycleStage: "development" },
      },
    });

    expect(output.outcome).toBe("succeeded");
    expect(output.gate).toBeUndefined();
    expect(output.reasonCode).toBeUndefined();
  });

  it("fails loud on a blocking verdict paired with a succeeded operation state", () => {
    expect(() =>
      buildDeployRuntimeInjectionOutputFromGateContext({
        operationId: OPERATION_ID,
        operationState: "succeeded",
        projectId: PROJECT_ID,
        environmentId: ENVIRONMENT_ID,
        context: {
          deliveryPath: PRODUCTION_DELIVERY_PATHS.runtimeInjection,
          environment: { isProtected: true, lifecycleStage: "production" },
          gateVerdict: {
            status: "blocked",
            delivery_blocking: true,
            checked_at: "2026-07-09T00:00:00.000Z",
            controls: [{ id: "storage.root_key", status: "blocked" }],
          },
        },
      }),
    ).toThrow(/inconsistent/u);
  });
});
