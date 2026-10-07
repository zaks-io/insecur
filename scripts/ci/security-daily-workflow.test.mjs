import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("daily vulnerability scanning preserves reports and fails on high findings", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/security-daily.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /id: grype[\s\S]*continue-on-error: true[\s\S]*sbom-grype\.sh high/u);
  assert.match(workflow, /name: Fail if grype failed[\s\S]*steps\.grype\.outcome == 'failure'/u);
  assert.match(workflow, /LINEAR_SECURITY_REPORTING_ENABLED != 'false'/u);
});

test("daily Semgrep gives slow rules time to finish and retains the scanner-error gate", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/security-daily.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /semgrep scan --config auto --timeout 30 --json/u);
  assert.match(workflow, /node scripts\/ci\/semgrep-policy\.mjs/u);
  assert.match(
    workflow,
    /name: Fail if semgrep failed[\s\S]*steps\.semgrep\.outcome == 'failure'/u,
  );
});
