import { describe, expect, it } from "vitest";

import {
  assertCliErrorEnvelope,
  assertCliOperationPollMetadataOnly,
  assertCliRunPolicyCreateMetadataOnly,
  assertCliRunPolicyDisableMetadataOnly,
  assertCliRunPolicyShowMetadataOnly,
} from "../src/cli-operations-run-policies-assertions";

describe("cli operations and run-policies assertions", () => {
  it("accepts a metadata-only operation poll envelope", () => {
    const data = assertCliOperationPollMetadataOnly(
      {
        ok: true,
        data: {
          operationId: "op_test",
          organizationId: "org_test",
          state: "succeeded",
          intentCode: "sync.run",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          progress: {},
        },
      },
      "CLI operations get",
    );
    expect(data.operationId).toBe("op_test");
  });

  it("rejects an operation poll envelope missing required fields", () => {
    expect(() => {
      assertCliOperationPollMetadataOnly(
        { ok: true, data: { operationId: "op_test" } },
        "CLI operations get",
      );
    }).toThrow();
  });

  it("accepts a metadata-only run-policies create envelope", () => {
    const data = assertCliRunPolicyCreateMetadataOnly(
      {
        ok: true,
        data: {
          policyId: "rp_test",
          policyVersionId: "rpv_test",
          displayName: "Preview Smoke Run Policy",
          auditEventId: "evt_test",
          activeVersion: {
            policyVersionId: "rpv_test",
            command: "printenv",
            secretIds: ["sec_test"],
          },
        },
      },
      "CLI run-policies create",
    );
    expect(data.policyId).toBe("rp_test");
  });

  it("rejects a run-policies create envelope with non-array secretIds", () => {
    expect(() => {
      assertCliRunPolicyCreateMetadataOnly(
        {
          ok: true,
          data: {
            policyId: "rp_test",
            policyVersionId: "rpv_test",
            displayName: "Preview Smoke Run Policy",
            auditEventId: "evt_test",
            activeVersion: {
              policyVersionId: "rpv_test",
              command: "printenv",
              secretIds: "sec_test",
            },
          },
        },
        "CLI run-policies create",
      );
    }).toThrow(/secretIds must be an array/);
  });

  it("accepts a metadata-only run-policies show envelope", () => {
    const data = assertCliRunPolicyShowMetadataOnly(
      {
        ok: true,
        data: {
          policyId: "rp_test",
          organizationId: "org_test",
          projectId: "proj_test",
          environmentId: "env_test",
          displayName: "Preview Smoke Run Policy",
          disabledAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          activeVersion: null,
        },
      },
      "CLI run-policies show",
    );
    expect(data.policyId).toBe("rp_test");
  });

  it("accepts a metadata-only run-policies disable envelope", () => {
    const data = assertCliRunPolicyDisableMetadataOnly(
      {
        ok: true,
        data: {
          policyId: "rp_test",
          disabledAt: "2026-01-01T00:00:00.000Z",
          auditEventId: "evt_test",
        },
      },
      "CLI run-policies disable",
    );
    expect(data.policyId).toBe("rp_test");
  });

  it("accepts a matching CLI error envelope written to stderr", () => {
    const errorEnvelope = {
      ok: false,
      error: { code: "operation.not_found", message: "Operation not found.", retryable: false },
    };
    const body = assertCliErrorEnvelope({
      exitCode: 5,
      expectedErrorCode: "operation.not_found",
      expectedExitCode: 5,
      label: "CLI operations get not-found",
      stderr: `${JSON.stringify(errorEnvelope)}\n`,
      stdout: "",
    });
    expect(body.ok).toBe(false);
  });

  it("rejects when the exit code does not match", () => {
    expect(() => {
      assertCliErrorEnvelope({
        exitCode: 1,
        expectedErrorCode: "operation.not_found",
        expectedExitCode: 5,
        label: "CLI operations get not-found",
        stderr: JSON.stringify({
          ok: false,
          error: { code: "operation.not_found", message: "x", retryable: false },
        }),
        stdout: "",
      });
    }).toThrow(/expected exit code 5/);
  });

  it("rejects when stdout carries success JSON alongside the failure", () => {
    expect(() => {
      assertCliErrorEnvelope({
        exitCode: 5,
        expectedErrorCode: "operation.not_found",
        expectedExitCode: 5,
        label: "CLI operations get not-found",
        stderr: JSON.stringify({
          ok: false,
          error: { code: "operation.not_found", message: "x", retryable: false },
        }),
        stdout: '{"ok":true}',
      });
    }).toThrow(/must not write success JSON/);
  });

  it("rejects when the error code does not match", () => {
    expect(() => {
      assertCliErrorEnvelope({
        exitCode: 5,
        expectedErrorCode: "runtime_policy.not_found",
        expectedExitCode: 5,
        label: "CLI run-policies show not-found",
        stderr: JSON.stringify({
          ok: false,
          error: { code: "operation.not_found", message: "x", retryable: false },
        }),
        stdout: "",
      });
    }).toThrow();
  });
});
