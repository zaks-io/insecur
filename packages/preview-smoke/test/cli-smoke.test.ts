import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertCliOutputSafe,
  assertCliRunChildExitCode,
  assertCliRunChildObservedSentinel,
  assertCliSmokeSuccess,
  buildCliFirstValueRunArgs,
  parseCliRunChildProof,
  parseLastCliSmokeJson,
} from "../src/cli-smoke";

const PROOF_VARIABLE_KEY = "INSECUR_PROOF_SECRET";
const CLI_RUN_ENVELOPE = {
  ok: true,
  data: { grantId: "grant_1", variableKey: PROOF_VARIABLE_KEY, childExitCode: 0 },
  meta: { requestId: "req_1" },
};

// With `--json`, `insecur run` keeps stdout a pure control channel and routes
// child stdout to the CLI's stderr (docs/cli-and-sync.md, INS-590). Real
// preview stderr is the child's marker lines interleaved with its proof JSON.
function fixtureRunStderr(childProof: Record<string, unknown>): string {
  return `child stdout marker line\nchild stderr marker line\n${JSON.stringify(childProof)}\n`;
}

const OBSERVED_PROOF = { ok: true, checked: PROOF_VARIABLE_KEY, proof: "hmac-challenge" };
const NOT_OBSERVED_PROOF = {
  ok: false,
  checked: PROOF_VARIABLE_KEY,
  reason: "missing_or_too_short",
};

describe("run-step output parsing", () => {
  it("targets an isolated proof variable when provided", () => {
    const variableKey = "INSECUR_PROOF_SECRET_AUDIT";
    expect(buildCliFirstValueRunArgs("verify.mjs", variableKey)).toContain(variableKey);

    const stdout = execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), "../../examples/first-value-proof/verify.mjs"),
        "--variable-key",
        variableKey,
      ],
      { encoding: "utf8", env: { ...process.env, [variableKey]: "x".repeat(32) } },
    );
    expect(JSON.parse(stdout)).toEqual({
      checked: variableKey,
      ok: true,
      proof: "hmac-challenge",
    });
  });
  it("parses the CLI envelope as the LAST JSON object in mixed output", () => {
    const body = parseLastCliSmokeJson(
      `remediation prose line\n${JSON.stringify(CLI_RUN_ENVELOPE)}\n`,
      "CLI run",
    );
    expect(body).toEqual(CLI_RUN_ENVELOPE);
    assertCliSmokeSuccess(body, "CLI run");
    assertCliRunChildExitCode(body, "CLI run");
  });

  it("rejects CLI run envelopes whose child process failed", () => {
    expect(() => {
      assertCliRunChildExitCode(
        {
          ...CLI_RUN_ENVELOPE,
          data: { ...CLI_RUN_ENVELOPE.data, childExitCode: 1 },
        },
        "CLI run",
      );
    }).toThrow(/CLI run childExitCode expected 0, got 1/);
  });

  it("throws with the strict no-JSON message when stdout has no object", () => {
    expect(() => parseLastCliSmokeJson("not json\nalso not json\n", "CLI run")).toThrow(
      /returned no JSON object/,
    );
  });
});

describe("child sentinel-observation assertion is LIVE", () => {
  it("PASSES when the fixture shows the sentinel was observed", () => {
    const childProof = parseCliRunChildProof(fixtureRunStderr(OBSERVED_PROOF), "CLI run");
    expect(childProof).toEqual(OBSERVED_PROOF);
    assertCliRunChildObservedSentinel(childProof, "CLI run");
  });

  it("FAILS when the fixture shows the sentinel was NOT observed", () => {
    const childProof = parseCliRunChildProof(fixtureRunStderr(NOT_OBSERVED_PROOF), "CLI run");
    expect(() => {
      assertCliRunChildObservedSentinel(childProof, "CLI run");
    }).toThrow(/child proof ok/);
  });

  it("throws when the routed child output carries no proof JSON", () => {
    expect(() => parseCliRunChildProof("marker only\n", "CLI run")).toThrow(
      /emitted no JSON proof in routed child output/,
    );
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

  it("throws when a sentinel value leaks into stderr", () => {
    expect(() => {
      assertCliOutputSafe({
        label: "CLI run",
        redactor,
        stderr: `leaked ${sentinel} here`,
        stdout: JSON.stringify(OBSERVED_PROOF),
      });
    }).toThrow(/leaked a secret value in CLI stderr/);
  });

  it("passes when no secret value is present", () => {
    assertCliOutputSafe({
      label: "CLI run",
      redactor,
      stderr: "",
      stdout: JSON.stringify(OBSERVED_PROOF),
    });
  });
});
