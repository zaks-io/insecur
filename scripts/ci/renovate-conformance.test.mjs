import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { collectRenovateConformanceProblems } from "./renovate-conformance.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

test("the committed Renovate delivery path conforms", () => {
  assert.deepEqual(collectRenovateConformanceProblems(REPO_ROOT), []);
});

test("noisy updates and missing hidden-branch CI fail closed", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "insecur-renovate-conformance-"));
  mkdirSync(join(fixtureRoot, ".github/workflows"), { recursive: true });

  const config = JSON.parse(readFileSync(join(REPO_ROOT, "renovate.json"), "utf8"));
  config.vulnerabilityAlerts.prCreation = "immediate";
  delete config.vulnerabilityAlerts.groupName;
  config.packageRules = config.packageRules.filter(
    (rule) => !rule.matchManagers?.includes("github-actions"),
  );
  writeFileSync(join(fixtureRoot, "renovate.json"), JSON.stringify(config));
  writeFileSync(
    join(fixtureRoot, ".github/workflows/ci.yml"),
    "on:\n  push:\n    branches:\n      - main\n",
  );

  const problems = collectRenovateConformanceProblems(fixtureRoot);
  assert.ok(problems.some((problem) => problem.includes("vulnerability fixes")));
  assert.ok(problems.some((problem) => problem.includes("grouped")));
  assert.ok(problems.some((problem) => problem.includes("GitHub Actions")));
  assert.ok(problems.some((problem) => problem.includes("renovate/**")));
});
