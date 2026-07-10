// Behavioral regression tests for the CI "Classify changed paths" step: the real bash
// script is extracted from ci.yml and executed against synthetic diffs, so classification
// drift (INS-587: security owner documents bypassing conformance) fails CI on the paths
// that can introduce it — product PRs via verify:policy's test:scripts and workflow-only
// PRs via the Workflow config checks step, which runs test:scripts as well.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parse } from "yaml";

const workflow = parse(
  readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
);
const classifyScript = workflow.jobs.changes.steps.find(
  (step) => step.name === "Classify changed paths",
).run;

// Serves $CLASSIFIER_FILES only to the expected diff invocation, so a future second git
// call in the classifier cannot be silently fed the file list. CLASSIFIER_GIT_FAIL=1
// simulates a git failure to prove the classifier fails closed.
const GIT_SHIM = `#!/bin/sh
if [ "\${CLASSIFIER_GIT_FAIL:-}" = "1" ]; then
  echo "git shim: simulated failure" >&2
  exit 128
fi
if [ "$1" != "diff" ] || [ "$2" != "--no-renames" ] || [ "$3" != "--name-only" ]; then
  echo "git shim: unexpected args: $*" >&2
  exit 64
fi
printf '%s' "$CLASSIFIER_FILES"
`;

function runClassifier({
  changedFiles,
  eventName = "pull_request",
  baseSha = "base",
  gitFails = false,
}) {
  const dir = mkdtempSync(join(tmpdir(), "path-classifier-"));
  try {
    const gitShim = join(dir, "git");
    writeFileSync(gitShim, GIT_SHIM);
    chmodSync(gitShim, 0o755);
    const outputFile = join(dir, "github-output");
    writeFileSync(outputFile, "");
    execFileSync("bash", ["-c", classifyScript], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        CLASSIFIER_FILES: changedFiles.map((file) => `${file}\n`).join(""),
        CLASSIFIER_GIT_FAIL: gitFails ? "1" : "",
        EVENT_NAME: eventName,
        BASE_SHA: baseSha,
        GITHUB_OUTPUT: outputFile,
      },
    });
    return Object.fromEntries(
      readFileSync(outputFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("=")),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SECURITY_OWNER_FILES = [
  "SECURITY.md",
  "docs/specs/deploy-route-inventory.md",
  "docs/specs/deploy-route-inventory.sidecar.json",
];

test("each security owner document alone triggers security_docs without product checks", () => {
  for (const file of SECURITY_OWNER_FILES) {
    const outputs = runClassifier({ changedFiles: [file] });
    assert.deepEqual(
      outputs,
      {
        db_backed: "false",
        product_code: "false",
        workflow_config: "false",
        security_docs: "true",
      },
      `classification for ${file}`,
    );
  }
});

test("ordinary prose-only changes stay fully short-circuited", () => {
  const outputs = runClassifier({
    changedFiles: ["docs/vision.md", "docs/specs/product-spec.md", "README.md"],
  });
  assert.deepEqual(outputs, {
    db_backed: "false",
    product_code: "false",
    workflow_config: "false",
    security_docs: "false",
  });
});

test("product code changes classify as product without security_docs", () => {
  const outputs = runClassifier({ changedFiles: ["apps/api/src/index.ts"] });
  assert.deepEqual(outputs, {
    db_backed: "true",
    product_code: "true",
    workflow_config: "false",
    security_docs: "false",
  });
});

test("mixed security-doc and prose changes still trigger the conformance path", () => {
  const outputs = runClassifier({
    changedFiles: ["docs/vision.md", "docs/specs/deploy-route-inventory.md"],
  });
  assert.equal(outputs.security_docs, "true");
  assert.equal(outputs.product_code, "false");
});

test("a pure rename of a security owner document still classifies security_docs", () => {
  // --no-renames makes git report both endpoints as delete + add.
  const outputs = runClassifier({ changedFiles: ["SECURITY.md", "SECURITY-OLD.md"] });
  assert.equal(outputs.security_docs, "true");
});

test("a failing git diff fails the classifier instead of short-circuiting as docs-only", () => {
  assert.throws(() => runClassifier({ changedFiles: ["SECURITY.md"], gitFails: true }));
});

test("non-PR events force every classification on", () => {
  const outputs = runClassifier({ changedFiles: [], eventName: "push", baseSha: "" });
  assert.deepEqual(outputs, {
    db_backed: "true",
    product_code: "true",
    workflow_config: "true",
    security_docs: "true",
  });
});
