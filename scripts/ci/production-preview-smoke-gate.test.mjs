import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = (name) =>
  readFile(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");

test("daily release owns the timezone-aware serialized release train", async () => {
  const daily = await workflow("daily-release.yml");

  assert.match(daily, /cron: "43 8 \* \* \*"\n\s+timezone: America\/Los_Angeles/u);
  assert.match(daily, /workflow_dispatch:\s*\n/u);
  assert.doesNotMatch(daily, /workflow_dispatch:\s*\n\s+inputs:/u);
  assert.match(daily, /group: daily-release\n\s+cancel-in-progress: false/u);
  assert.match(daily, /node scripts\/ci\/select-release-candidate\.mjs/u);
  assert.match(daily, /preview:[\s\S]*needs: select[\s\S]*deploy_sha:/u);
  assert.match(daily, /smoke:[\s\S]*- preview[\s\S]*deploy_sha:/u);
  assert.match(
    daily,
    /production:[\s\S]*- smoke[\s\S]*ci_run_id:[\s\S]*deploy_sha:[\s\S]*orchestrator_sha: \$\{\{ github\.workflow_sha \}\}/u,
  );
  assert.match(
    daily,
    /needs\.select\.outputs\.action == 'deploy' && needs\.production\.result == 'success'/u,
  );
  assert.match(daily, /finalize:[\s\S]*permissions:\n\s+contents: write/u);
  assert.match(daily, /contents: write\n\s+statuses: write/u);
  assert.match(daily, /context="Production release verified"[\s\S]*git\/refs\/heads\/production/u);
  assert.doesNotMatch(daily.slice(0, daily.indexOf("finalize:")), /contents: write/u);
  assert.doesNotMatch(daily, /secrets: inherit/u);
  const previewSecrets = daily.slice(daily.indexOf("  preview:"), daily.indexOf("  smoke:"));
  const smokeSecrets = daily.slice(daily.indexOf("  smoke:"), daily.indexOf("  production:"));
  assert.doesNotMatch(previewSecrets, /LINEAR_ACCESS_KEY|PRODUCTION_DATABASE_URL_MIGRATION/u);
  assert.doesNotMatch(
    smokeSecrets,
    /LINEAR_ACCESS_KEY|PRODUCTION_DATABASE_URL_MIGRATION|RUNTIME_TOKEN_SIGNING_SECRET|SENTRY_AUTH_TOKEN/u,
  );
});

test("Preview deployment and smoke are exact-SHA reusable stages", async () => {
  const deployPreview = await workflow("deploy-preview.yml");
  const previewSmoke = await workflow("preview-smoke.yml");
  const previewSmokeConfig = await readFile(
    new URL("../../packages/preview-smoke/playwright.preview.config.ts", import.meta.url),
    "utf8",
  );

  for (const source of [deployPreview, previewSmoke]) {
    assert.match(source, /workflow_call:\n\s+inputs:\n\s+deploy_sha:/u);
    assert.match(source, /workflow_call:[\s\S]*secrets:/u);
    assert.doesNotMatch(source, /workflow_dispatch/u);
    assert.match(source, /ref: \$\{\{ inputs\.deploy_sha \}\}/u);
  }
  assert.match(deployPreview, /INSECUR_DEPLOY_SHA: \$\{\{ inputs\.deploy_sha \}\}/u);
  assert.match(deployPreview, /SENTRY_RELEASE: \$\{\{ inputs\.deploy_sha \}\}/u);
  assert.match(previewSmoke, /SMOKE_EXPECTED_DEPLOY_SHA: \$\{\{ inputs\.deploy_sha \}\}/u);
  assert.match(deployPreview, /group: preview-fleet\n\s+cancel-in-progress: false/u);
  assert.match(previewSmoke, /group: preview-fleet\n\s+cancel-in-progress: false/u);
  assert.match(previewSmokeConfig, /^\s*workers\s*:\s*4\s*(?:,|$)/mu);
});

test("production consumes same-run Preview proof before mutation", async () => {
  const production = await workflow("deploy-production.yml");

  assert.match(production, /workflow_call:\n\s+inputs:[\s\S]*deploy_sha:/u);
  assert.doesNotMatch(production, /workflow_dispatch|workflow_run:/u);
  assert.match(production, /RELEASE_ID: \$\{\{ inputs\.deploy_sha \}\}/u);
  assert.match(
    production,
    /ref: \$\{\{ inputs\.orchestrator_sha \}\}\n\s+path: \.release-orchestrator/u,
  );
  assert.match(
    production,
    /actions\/download-artifact@[0-9a-f]{40} # v8[\s\S]*name: preview-smoke-artifacts/u,
  );
  assert.match(
    production,
    /verify-preview-smoke-identity\s+\\\n\s+--evidence "\$GITHUB_WORKSPACE\/\$proof_path"/u,
  );
  assert.match(production, /--expected-sha "\$DEPLOY_SHA"/u);
  assert.doesNotMatch(production, /No successful Preview Smoke run was found/u);

  const proof = production.indexOf("- name: Require verified Preview fleet identity");
  const migration = production.indexOf("- name: Migrate production database");
  assert.ok(proof >= 0 && migration > proof);
});

test("production reports incomplete launch evidence without blocking prelaunch deploys", async () => {
  const production = await workflow("deploy-production.yml");

  assert.match(
    production,
    /release-gate:bundle -- --profile small_group_production --evidence-dir "\$GITHUB_WORKSPACE\/evidence" --warn-only/u,
  );
  assert.match(production, /::warning::Small-group production evidence is advisory/u);
  assert.doesNotMatch(production, /continue-on-error:\s*true/u);
});

test("production verifies live identity and uses one release identity for Sentry and Linear", async () => {
  const production = await workflow("deploy-production.yml");

  assert.match(production, /fetch-depth: 0/u);
  assert.match(production, /SENTRY_RELEASE: \$\{\{ env\.RELEASE_ID \}\}/u);
  assert.match(
    production,
    /EXPECTED_SHA: \$\{\{ env\.RELEASE_ID \}\}[\s\S]*node \.release-orchestrator\/scripts\/ci\/verify-production-health\.mjs\n\s+"\$EXPECTED_SHA"/u,
  );
  assert.match(production, /uses: linear\/linear-release-action@[0-9a-f]{40} # v0\.14\.5/u);
  assert.match(production, /access_key: \$\{\{ secrets\.LINEAR_ACCESS_KEY \}\}/u);
  assert.match(production, /name: \$\{\{ env\.RELEASE_ID \}\}/u);
  assert.match(production, /version: \$\{\{ env\.RELEASE_ID \}\}/u);
  const productionReleasePaths =
    "apps/api/**,apps/runtime/**,apps/site/**,apps/web/**,packages/access/**,packages/agent-attribution/**,packages/app-connection/**,packages/audit/**,packages/auth/**,packages/backup-restore/**,packages/crypto/**,packages/custody-contracts/**,packages/domain/**,packages/high-assurance/**,packages/instance-bootstrap/**,packages/machine-auth/**,packages/notifications/**,packages/observability/**,packages/onboarding/**,packages/operations/**,packages/protected-change/**,packages/runtime-injection/**,packages/runtime-injection-issue/**,packages/secret-store/**,packages/secret-store-contracts/**,packages/secret-sync/**,packages/storage-security-gate/**,packages/tenant-keyring/**,packages/tenant-store/**,packages/token-signing/**,packages/ui/**,packages/worker-kit/**";
  assert.ok(production.includes(`include_paths: "${productionReleasePaths}"`));

  const sentry = production.indexOf("- name: Verify Sentry source maps for production release");
  const health = production.indexOf("- name: Verify production fleet identity");
  const linear = production.indexOf("- name: Sync production release to Linear");
  assert.ok(sentry >= 0 && health > sentry && linear > health);
});
