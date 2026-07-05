import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const workflowPath = join(process.cwd(), ".github", "workflows", "security-daily.yml");

test("security-daily gitleaks history scan is scoped to default-branch HEAD", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  const historyJob = workflow.slice(workflow.indexOf("secret-scan-history:"));
  assert.match(
    historyJob,
    /GITLEAKS_LOG_OPTS:\s*HEAD/,
    "secret-scan-history must set GITLEAKS_LOG_OPTS=HEAD so open PR refs cannot fail the scheduled scan",
  );

  const gitleaksStep = historyJob.slice(historyJob.indexOf("Scan git history for secrets"));
  assert.match(
    gitleaksStep,
    /gitleaks-detect\.sh git/,
    "secret-scan-history must run gitleaks in git history mode",
  );
  assert.doesNotMatch(
    gitleaksStep.slice(0, gitleaksStep.indexOf("Summarize critical gitleaks findings")),
    /GITLEAKS_LOG_OPTS:\s*""|GITLEAKS_LOG_OPTS:\s*''/,
    "GITLEAKS_LOG_OPTS must not be blanked in the gitleaks history step",
  );
});
