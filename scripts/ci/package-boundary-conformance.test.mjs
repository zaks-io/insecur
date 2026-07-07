import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ciVerifyStepsRunPackageBoundaryConformance } from "./package-boundary-conformance-lib.mjs";

const workflowPath = join(process.cwd(), ".github", "workflows", "ci.yml");

test("CI Verify runs package-boundary conformance across multi-step jobs", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.equal(ciVerifyStepsRunPackageBoundaryConformance(workflow), true);
});

test("CI Verify package-boundary assertion is not limited to the first run block", () => {
  const workflow = `
jobs:
  verify:
    steps:
      - name: Secret scan
        run: |
          bash scripts/ci/install-gitleaks.sh
          bash scripts/ci/gitleaks-detect.sh detect
      - name: Product checks
        run: |
          pnpm duplicates:ci
          pnpm conformance:packages
`;

  assert.equal(ciVerifyStepsRunPackageBoundaryConformance(workflow), true);
});

test("CI Verify package-boundary assertion fails when the command is absent", () => {
  const workflow = `
jobs:
  verify:
    steps:
      - name: Product checks
        run: pnpm duplicates:ci
`;

  assert.equal(ciVerifyStepsRunPackageBoundaryConformance(workflow), false);
});
