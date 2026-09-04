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

test("comment automation authorizes callers before privileged jobs", async () => {
  const claude = await workflow("claude.yml");
  const authorize = claude.slice(claude.indexOf("  authorize:"), claude.indexOf("  claude:"));
  const privilegedJobs = claude.slice(claude.indexOf("  claude:"));

  assert.match(authorize, /permissions:\n\s+contents: read/u);
  assert.match(authorize, /collaborators\/\$ACTOR\/permission/u);
  assert.match(authorize, /--jq '\.permission'/u);
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
});
