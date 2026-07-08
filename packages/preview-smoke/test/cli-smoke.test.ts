import { describe, expect, it } from "vitest";

import {
  assertCliOutputSafe,
  assertCliRunChildExitCode,
  assertCliRunChildObservedSentinel,
  assertCliSmokeSuccess,
  parseCliRunChildProof,
  parseLastCliSmokeJson,
} from "../src/cli-smoke";

const PROOF_VARIABLE_KEY = "INSECUR_PROOF_SECRET";

// The `run` command inherits the child's stdio, so real preview stdout is the
// child proof JSON followed by the CLI `--json` success envelope.
function fixtureStdout(childProof: Record<string, unknown>): string {
  const envelope = {
    ok: true,
    data: { grantId: "grant_1", variableKey: PROOF_VARIABLE_KEY, childExitCode: 0 },
    meta: { requestId: "req_1" },
  };
  return `${JSON.stringify(childProof)}\n${JSON.stringify(envelope)}\n`;
}

const OBSERVED_PROOF = { ok: true, checked: PROOF_VARIABLE_KEY, proof: "hmac-challenge" };
const NOT_OBSERVED_PROOF = {
  ok: false,
  checked: PROOF_VARIABLE_KEY,
  reason: "missing_or_too_short",
};

describe("run-step stdout parsing", () => {
  it("parses the CLI envelope as the LAST JSON object on stdout", () => {
    const body = parseLastCliSmokeJson(fixtureStdout(OBSERVED_PROOF), "CLI run");
    assertCliSmokeSuccess(body, "CLI run");
    expect(() => {
      assertCliRunChildExitCode(body, "CLI run");
    }).not.toThrow();
  });

  it("throws with the strict no-JSON message when stdout has no object", () => {
    expect(() => parseLastCliSmokeJson("not json\nalso not json\n", "CLI run")).toThrow(
      /returned no JSON object/,
    );
  });
});

describe("child sentinel-observation assertion is LIVE", () => {
  it("PASSES when the fixture shows the sentinel was observed", () => {
    const stdout = fixtureStdout(OBSERVED_PROOF);
    const childProof = parseCliRunChildProof(stdout, "CLI run");
    expect(() => {
      assertCliRunChildObservedSentinel(childProof, "CLI run");
    }).not.toThrow();
  });

  it("FAILS when the fixture shows the sentinel was NOT observed", () => {
    const stdout = fixtureStdout(NOT_OBSERVED_PROOF);
    const childProof = parseCliRunChildProof(stdout, "CLI run");
    expect(() => {
      assertCliRunChildObservedSentinel(childProof, "CLI run");
    }).toThrow(/child proof ok/);
  });
});

describe("output redaction covers the sentinel, not just the bearer", () => {
  const sentinel = "insecur-smoke-super-secret-value";
  const redactor = (value: unknown): string => String(value).split(sentinel).join("[redacted]");

  it("throws when a sentinel value leaks into stdout", () => {
    expect(() => {
      assertCliOutputSafe({
        label: "CLI run",
        redactor,
        stderr: "",
        stdout: `leaked ${sentinel} here`,
      });
    }).toThrow(/leaked a secret value in CLI stdout/);
  });

  it("passes when no secret value is present", () => {
    expect(() => {
      assertCliOutputSafe({
        label: "CLI run",
        redactor,
        stderr: "",
        stdout: JSON.stringify(OBSERVED_PROOF),
      });
    }).not.toThrow();
  });
});
