import { AUTH_ERROR_CODES, errorEnvelope } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { cliErrorFromEnvelope } from "../src/output/api-cli-error.js";

describe("cliErrorFromEnvelope", () => {
  it("threads requestId and supplements step-up poll remediation from meta", () => {
    const error = cliErrorFromEnvelope(
      errorEnvelope(
        {
          code: AUTH_ERROR_CODES.highAssuranceRequired,
          message: "Human approval required.",
          retryable: false,
        },
        { meta: { operationId: "op_01TEST00000000000000000001" as never } },
      ),
    );
    expect(error.meta?.operationId).toBe("op_01TEST00000000000000000001");
    expect(error.remediation?.poll).toEqual([
      "insecur",
      "operations",
      "wait",
      "op_01TEST00000000000000000001",
      "--json",
    ]);
  });

  it("preserves server-provided remediation over supplements", () => {
    const error = cliErrorFromEnvelope(
      errorEnvelope(
        {
          code: AUTH_ERROR_CODES.highAssuranceRequired,
          message: "Human approval required.",
          retryable: false,
        },
        {
          meta: { operationId: "op_01TEST00000000000000000001" as never },
          remediation: {
            approvalUrl: "https://app.insecur.cloud/orgs/org_test/approvals/op_test",
            poll: ["insecur", "operations", "wait", "op_test", "--json"],
          },
        },
      ),
    );
    expect(error.remediation?.approvalUrl).toBe(
      "https://app.insecur.cloud/orgs/org_test/approvals/op_test",
    );
  });
});
