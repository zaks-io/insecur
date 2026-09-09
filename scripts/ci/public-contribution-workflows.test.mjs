import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = (name) =>
  readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");

test("pull request CI cannot reach privileged Preview deployment", async () => {
  const ci = await workflow("ci.yml");
  const dailyRelease = await workflow("daily-release.yml");
  const deployPreview = await workflow("deploy-preview.yml");

  assert.match(ci, /on:\n\s+pull_request:/u);
  assert.doesNotMatch(ci, /deploy-preview\.yml|environment:\s+Preview/u);
  assert.doesNotMatch(ci, /CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)|PREVIEW_DATABASE_URL_MIGRATION/u);
  assert.doesNotMatch(dailyRelease, /\n\s+pull_request:/u);
  assert.match(deployPreview, /on:\n\s+workflow_call:/u);
  assert.doesNotMatch(deployPreview, /\n\s+pull_request:/u);
});

test("only reviewed CI refs receive signed remote-cache write credentials", async () => {
  const ci = await workflow("ci.yml");
  const trustedWriterCondition =
    /\(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) \|\| github\.event_name == 'merge_group'/gu;

  assert.equal(
    ci.match(trustedWriterCondition)?.length,
    3,
    "each remote-cache credential must be restricted to main pushes and merge-group commits",
  );
  assert.match(ci, /push:\n\s+branches:\n\s+- main\n[\s\S]+- "renovate\/\*\*"/u);
  assert.doesNotMatch(
    ci,
    /\(github\.event_name == 'push' \|\| github\.event_name == 'merge_group'\) && secrets\.TURBO_/u,
  );
});

test("comment automation authorizes callers before privileged jobs", async () => {
  const claude = await workflow("claude.yml");
  const claudeAgent = await workflow("claude-agent-reusable.yml");
  const claudeReview = await workflow("claude-code-review-reusable.yml");
  const authorize = claude.slice(claude.indexOf("  authorize:"), claude.indexOf("  claude:"));
  const privilegedJobs = claude.slice(claude.indexOf("  claude:"));

  assert.match(authorize, /permissions:\n\s+contents: read/u);
  assert.match(authorize, /collaborators\/\$ACTOR\/permission/u);
  assert.match(authorize, /--jq '\.permission'/u);
  assert.match(
    authorize,
    /if permission="\$\(gh api[\s\S]+else\n\s+allowed=false\n\s+fi/u,
    "a failed permission lookup must deny the caller without failing authorization",
  );
  assert.match(authorize, /admin\|write\) allowed=true/u);
  assert.doesNotMatch(authorize, /secrets\.|contents: write|id-token: write/u);
  assert.equal(
    privilegedJobs.match(/needs: authorize/g)?.length,
    2,
    "each secret-bearing reusable workflow must depend on caller authorization",
  );
  assert.equal(
    privilegedJobs.match(/needs\.authorize\.outputs\.allowed == 'true'/g)?.length,
    2,
    "each secret-bearing reusable workflow must fail closed for a public caller",
  );
  assert.match(privilegedJobs, /uses: \.\/\.github\/workflows\/claude-agent-reusable\.yml/u);
  assert.match(privilegedJobs, /uses: \.\/\.github\/workflows\/claude-code-review-reusable\.yml/u);
  assert.doesNotMatch(
    privilegedJobs,
    /uses: zaks-io\/claude-code-action/u,
    "credentialed jobs must not delegate to workflows with unpinned nested actions",
  );
  assert.ok(
    claudeReview.indexOf("- name: Create check run") <
      claudeReview.indexOf("- name: Checkout code"),
    "comment-triggered reviews must resolve the pull request head before review",
  );
  assert.match(claudeReview, /core\.setOutput\('head_sha', pr\.data\.head\.sha\)/u);
  for (const reusableWorkflow of [claudeAgent, claudeReview]) {
    assert.match(reusableWorkflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u);
    assert.doesNotMatch(reusableWorkflow, /ref: .*head\.sha/u);
  }
  assert.match(claudeReview, /persist-credentials: false/u);
  assert.match(
    claudeReview,
    /REVIEW HEAD SHA: \$\{\{ inputs\.trigger_type == 'comment' && steps\.check\.outputs\.head_sha \|\| github\.event\.pull_request\.head\.sha \}\}/u,
  );
  assert.match(claudeReview, /Do not execute, source, or install code from the pull request\./u);
  for (const reusableWorkflow of [claudeAgent, claudeReview]) {
    assert.match(reusableWorkflow, /runs-on: blacksmith-2vcpu-ubuntu-2404/u);
    assert.doesNotMatch(reusableWorkflow, /runs-on: ubuntu-latest/u);
    assert.match(reusableWorkflow, /claude_code_oauth_token:/u);
    assert.doesNotMatch(
      reusableWorkflow,
      /id-token: write/u,
      "OAuth-authenticated workflows must not mint GitHub OIDC tokens",
    );
  }
});
