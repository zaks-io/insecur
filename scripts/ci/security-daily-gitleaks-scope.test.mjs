import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

const workflowPath = join(process.cwd(), ".github", "workflows", "security-daily.yml");
const REQUIRED_GITLEAKS_LOG_OPTS = "HEAD";
const GITLEAKS_HISTORY_STEP_NAME = "Scan git history for secrets";

function readSecurityDailyGitleaksStep(workflowSource) {
  const workflow = parseYaml(workflowSource);
  const steps = workflow?.jobs?.["secret-scan-history"]?.steps;
  assert.ok(Array.isArray(steps), "secret-scan-history job must define steps");

  const gitleaksStep = steps.find((step) => step?.name === GITLEAKS_HISTORY_STEP_NAME);
  assert.ok(
    gitleaksStep,
    `secret-scan-history must include a "${GITLEAKS_HISTORY_STEP_NAME}" step`,
  );

  return gitleaksStep;
}

function readSecurityDailyGitleaksLogOpts(workflowSource) {
  const logOpts = readSecurityDailyGitleaksStep(workflowSource)?.env?.GITLEAKS_LOG_OPTS;
  assert.ok(
    typeof logOpts === "string" && logOpts.length > 0,
    "GITLEAKS_LOG_OPTS must be a non-empty string in the gitleaks history step",
  );

  return logOpts;
}

function assertExactHeadLogOpts(workflowSource) {
  const logOpts = readSecurityDailyGitleaksLogOpts(workflowSource);
  assert.equal(
    logOpts,
    REQUIRED_GITLEAKS_LOG_OPTS,
    `GITLEAKS_LOG_OPTS must be exactly "${REQUIRED_GITLEAKS_LOG_OPTS}" so open PR refs cannot widen the scheduled scan`,
  );
  return logOpts;
}

function assertGitleaksGitHistoryMode(workflowSource) {
  const runCommand = readSecurityDailyGitleaksStep(workflowSource)?.run;
  assert.ok(
    typeof runCommand === "string" && runCommand.includes("gitleaks-detect.sh git"),
    "secret-scan-history must run gitleaks in git history mode",
  );
}

test("security-daily gitleaks history scan sets GITLEAKS_LOG_OPTS to exactly HEAD", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assertExactHeadLogOpts(workflow);
  assertGitleaksGitHistoryMode(workflow);
});

test("widened GITLEAKS_LOG_OPTS fixtures fail the exact HEAD scope assertion", () => {
  const widenedFixtures = [
    {
      name: "HEAD --all suffix widens scan refs",
      value: "HEAD --all",
    },
    {
      name: "bare --all widens scan refs",
      value: "--all",
    },
  ];

  for (const fixture of widenedFixtures) {
    const workflowSource = fixtureWorkflow(fixture.value);
    assert.throws(
      () => assertExactHeadLogOpts(workflowSource),
      (error) => {
        assert.match(
          String(error?.message ?? error),
          new RegExp(`must be exactly "${REQUIRED_GITLEAKS_LOG_OPTS}"`),
        );
        return true;
      },
      `${fixture.name}: widened GITLEAKS_LOG_OPTS must fail the regression check`,
    );
  }
});

function fixtureWorkflow(gitleaksLogOpts) {
  return `
jobs:
  secret-scan-history:
    steps:
      - name: ${GITLEAKS_HISTORY_STEP_NAME}
        env:
          GITLEAKS_LOG_OPTS: ${JSON.stringify(gitleaksLogOpts)}
        run: bash scripts/ci/gitleaks-detect.sh git
`;
}
