import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  STORAGE_GATE_ERROR_CODES,
  type AuditEventId,
  type EnvironmentId,
  type OperationId,
  type ProjectId,
  type RuntimePolicyId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import type { DeployRuntimeInjectionOutputData } from "../src/api/deploy-runtime-injection-output-types.js";
import {
  buildDeployRuntimeInjectionResolvedTargets,
  formatDeployRuntimeInjectionHuman,
  renderDeployRuntimeInjectionOutput,
} from "../src/output/deploy-runtime-injection-output.js";

const OPERATION_ID = "op_01JZ8E4D7G2K8M5N0P3R6T9V1X" as OperationId;
const PROJECT_ID = "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X" as ProjectId;
const ENVIRONMENT_ID = "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V" as EnvironmentId;
const POLICY_ID = "rp_01JZ8E7K0N4P6T9V2X5Z8C1D3F" as RuntimePolicyId;
const AUDIT_ID = "aud_01JZ8E9P8S3V6X0Z2C5D8F1G4H" as AuditEventId;

const succeeded: DeployRuntimeInjectionOutputData = {
  operationId: OPERATION_ID,
  operationState: "succeeded",
  outcome: "succeeded",
  target: {
    projectId: PROJECT_ID,
    environmentId: ENVIRONMENT_ID,
    isProtected: true,
    lifecycleStage: "production",
    deliveryPath: "runtime_injection",
    runtimePolicyId: POLICY_ID,
  },
  gate: {
    status: "passed",
    deliveryBlocking: false,
    checkedAt: "2026-07-09T00:00:00.000Z",
    blockedControlIds: [],
  },
  warnings: [],
  auditEventIds: [AUDIT_ID],
};

const deniedGate: DeployRuntimeInjectionOutputData = {
  operationId: OPERATION_ID,
  operationState: "blocked",
  outcome: "denied",
  target: {
    projectId: PROJECT_ID,
    environmentId: ENVIRONMENT_ID,
    isProtected: true,
    lifecycleStage: "production",
    deliveryPath: "runtime_injection",
  },
  gate: {
    status: "blocked",
    deliveryBlocking: true,
    checkedAt: "2026-07-09T00:00:00.000Z",
    blockedControlIds: ["storage.root_key", "storage.no_plaintext_persistence"],
  },
  reasonCode: STORAGE_GATE_ERROR_CODES.gateBlocked,
  warnings: [],
  auditEventIds: [],
};

const failed: DeployRuntimeInjectionOutputData = {
  operationId: OPERATION_ID,
  operationState: "failed",
  outcome: "failed",
  target: {
    projectId: PROJECT_ID,
    environmentId: ENVIRONMENT_ID,
    isProtected: true,
    lifecycleStage: "production",
    deliveryPath: "runtime_injection",
  },
  reasonCode: INJECTION_ERROR_CODES.decryptFailed,
  warnings: [{ code: STORAGE_GATE_ERROR_CODES.gateUnknown, controlIds: ["storage.keyring"] }],
  auditEventIds: [AUDIT_ID],
};

function captureJson(data: DeployRuntimeInjectionOutputData): Record<string, unknown> {
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  renderDeployRuntimeInjectionOutput(data, { json: true, quiet: false });
  const line = String(stdout.mock.calls[0]?.[0]);
  stdout.mockRestore();
  return JSON.parse(line) as Record<string, unknown>;
}

describe("formatDeployRuntimeInjectionHuman", () => {
  it("renders a succeeded outcome with operation, gate, and audit sections", () => {
    const text = formatDeployRuntimeInjectionHuman(succeeded);
    expect(text).toContain(OPERATION_ID);
    expect(text).toContain("succeeded");
    expect(text).toContain("Storage Security Gate");
    expect(text).toContain("Audit events");
    expect(text).toContain(AUDIT_ID);
  });

  it("renders a denied-gate outcome with the blocking reason and blocked controls", () => {
    const text = formatDeployRuntimeInjectionHuman(deniedGate);
    expect(text).toContain("denied");
    expect(text).toContain(STORAGE_GATE_ERROR_CODES.gateBlocked);
    expect(text).toContain("storage.root_key");
  });

  it("renders a failed outcome with a warning line", () => {
    const text = formatDeployRuntimeInjectionHuman(failed);
    expect(text).toContain("failed");
    expect(text).toContain(INJECTION_ERROR_CODES.decryptFailed);
    expect(text).toContain("Warnings");
    expect(text).toContain(STORAGE_GATE_ERROR_CODES.gateUnknown);
  });
});

describe("buildDeployRuntimeInjectionResolvedTargets", () => {
  it("builds a project → environment → runtime_policy echo chain of opaque ids", () => {
    const echoes = buildDeployRuntimeInjectionResolvedTargets(succeeded);
    expect(echoes.map((echo) => echo.type)).toEqual(["project", "environment", "runtime_policy"]);
    expect(echoes[2]?.id).toBe(POLICY_ID);
    expect(echoes[1]?.parent?.id).toBe(PROJECT_ID);
  });

  it("omits the runtime_policy echo when no policy is bound", () => {
    const echoes = buildDeployRuntimeInjectionResolvedTargets(deniedGate);
    expect(echoes.map((echo) => echo.type)).toEqual(["project", "environment"]);
  });
});

describe("renderDeployRuntimeInjectionOutput JSON", () => {
  it("emits a stable, versioned success envelope for CI consumption", () => {
    const envelope = captureJson(deniedGate);
    expect(envelope.schemaVersion).toBe("1");
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual(deniedGate);
    const meta = envelope.meta as Record<string, unknown>;
    expect(meta.operationId).toBe(OPERATION_ID);
    expect(Array.isArray(meta.resolvedTargets)).toBe(true);
  });

  it("keeps the JSON key set stable across outcomes", () => {
    const succeededJson = captureJson(succeeded);
    const failedJson = captureJson(failed);
    expect(Object.keys(succeededJson).sort()).toEqual(["data", "meta", "ok", "schemaVersion"]);
    expect(Object.keys(failedJson).sort()).toEqual(["data", "meta", "ok", "schemaVersion"]);
  });

  it("never leaks a Sensitive Value: no forbidden keys, values, or plaintext in JSON", () => {
    const withSecretLikeInput: DeployRuntimeInjectionOutputData = {
      ...succeeded,
      auditEventIds: [AUDIT_ID],
    };
    const serialized = JSON.stringify(captureJson(withSecretLikeInput));
    for (const forbidden of [
      "valueUtf8",
      "plaintext",
      "sensitiveValue",
      '"secret":',
      "ciphertext",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("rejects a forbidden Sensitive Value key smuggled onto the data model", () => {
    const tainted = {
      ...deniedGate,
      valueUtf8: "super-secret",
    } as DeployRuntimeInjectionOutputData;
    expect(() =>
      renderDeployRuntimeInjectionOutput(tainted, { json: true, quiet: false }),
    ).toThrow();
  });

  it("carries an actionable reason code for authorization denials", () => {
    const authDenied: DeployRuntimeInjectionOutputData = {
      ...deniedGate,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    };
    const envelope = captureJson(authDenied);
    const data = envelope.data as Record<string, unknown>;
    expect(data.reasonCode).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(data.outcome).toBe("denied");
  });
});
