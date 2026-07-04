import assert from "node:assert/strict";
import test from "node:test";

import {
  createManifestRun,
  createRedactor,
  failCheck,
  formatGithubSummary,
  passCheck,
  skipCheck,
  sweepPostgresColumns,
} from "./preview-smoke-lib.mjs";

const sentinel = {
  fingerprint: "sentinel-fingerprint",
  value: "raw-secret-sentinel",
  variants: [
    { encoding: "raw", pattern: "raw-secret-sentinel" },
    { encoding: "base64", pattern: "cmF3LXNlY3JldC1zZW50aW5lbA==" },
    { encoding: "base64url", pattern: "cmF3LXNlY3JldC1zZW50aW5lbA" },
    { encoding: "hex", pattern: "7261772d7365637265742d73656e74696e656c" },
  ],
};

test("redactor removes every sentinel encoding and smoke credentials", () => {
  const redactor = createRedactor([
    ...sentinel.variants.map((variant) => variant.pattern),
    "session-credential",
    "bearer-token",
  ]);

  const output = redactor(
    "raw-secret-sentinel cmF3LXNlY3JldC1zZW50aW5lbA== cmF3LXNlY3JldC1zZW50aW5lbA 7261772d7365637265742d73656e74696e656c session-credential bearer-token",
  );

  assert.doesNotMatch(output, /raw-secret-sentinel/u);
  assert.doesNotMatch(output, /cmF3LXNlY3JldC1zZW50aW5lbA/u);
  assert.doesNotMatch(output, /7261772d7365637265742d73656e74696e656c/u);
  assert.doesNotMatch(output, /session-credential|bearer-token/u);
  assert.match(output, /\[redacted\]/u);
});

test("manifest summary reports pass, skip, and failure without secret values", () => {
  const run = createManifestRun({
    sha: "abc123",
    runId: "456",
    workflowUrl: "https://github.com/zaks-io/insecur/actions/runs/456",
    startedAt: "2026-07-04T00:00:00.000Z",
  });
  passCheck(run, "deploy.identity.api", { deploySha: "abc123" });
  skipCheck(run, "operations.poll", "No operation id returned.");
  failCheck(run, "plaintext_sweep.postgres", "Plaintext sweep found [redacted]");

  const summary = formatGithubSummary(run);

  assert.match(summary, /Status: FAIL/u);
  assert.match(summary, /PASSED: deploy\.identity\.api/u);
  assert.match(summary, /SKIPPED: operations\.poll/u);
  assert.match(summary, /FAILED: plaintext_sweep\.postgres/u);
  assert.doesNotMatch(summary, /raw-secret-sentinel/u);
});

test("plaintext sweep detects an inserted sentinel positive control", async () => {
  const sql = {
    unsafe: async (_query, values) =>
      values[0].includes("raw-secret-sentinel") ? [{ hit: 1 }] : [],
  };

  const hits = await sweepPostgresColumns(
    sql,
    [
      {
        tableName: "secret_versions",
        columnName: "ciphertext_storage_ref",
        dataType: "text",
        udtName: "text",
      },
    ],
    sentinel,
  );

  assert.deepEqual(hits, [
    {
      tableName: "secret_versions",
      columnName: "ciphertext_storage_ref",
      encoding: "raw",
    },
  ]);
});
