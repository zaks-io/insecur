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
  const preview = daily.slice(daily.indexOf("  preview:"), daily.indexOf("  smoke:"));
  const smoke = daily.slice(daily.indexOf("  smoke:"), daily.indexOf("  smoke_gate:"));
  const smokeGate = daily.slice(daily.indexOf("  smoke_gate:"), daily.indexOf("  linear_preview:"));
  const production = daily.slice(
    daily.indexOf("  production:"),
    daily.indexOf("  linear_production:"),
  );
  assert.match(preview, /needs: select[\s\S]*deploy_sha:/u);
  assert.match(smoke, /- preview[\s\S]*deploy_sha:/u);
  assert.match(
    smokeGate,
    /needs:\n\s+- select\n\s+- smoke[\s\S]*needs\.smoke\.outputs\.proof_passed[\s\S]*Preview proof failed/u,
  );
  assert.match(
    production,
    /- smoke_gate\n\s+- linear_preview[\s\S]*ci_run_id:[\s\S]*deploy_sha:[\s\S]*orchestrator_sha: \$\{\{ github\.workflow_sha \}\}/u,
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
  assert.doesNotMatch(preview, /LINEAR_ACCESS_KEY|PRODUCTION_DATABASE_URL_MIGRATION/u);
  assert.doesNotMatch(
    smoke,
    /LINEAR_ACCESS_KEY|PRODUCTION_DATABASE_URL_MIGRATION|RUNTIME_TOKEN_SIGNING_SECRET|SENTRY_AUTH_TOKEN/u,
  );
});

test("daily release records the exact SHA in environment-scoped Linear pipelines", async () => {
  const daily = await workflow("daily-release.yml");
  const linearPreview = daily.slice(
    daily.indexOf("  linear_preview:"),
    daily.indexOf("  production:"),
  );
  const linearProduction = daily.slice(
    daily.indexOf("  linear_production:"),
    daily.indexOf("  finalize:"),
  );
  const finalize = daily.slice(daily.indexOf("  finalize:"), daily.indexOf("  no_change:"));
  const noChange = daily.slice(daily.indexOf("  no_change:"));

  assert.match(
    linearPreview,
    /- smoke_gate[\s\S]*if: needs\.select\.outputs\.action == 'deploy'[\s\S]*environment: Preview[\s\S]*command: sync/u,
  );
  assert.match(
    linearProduction,
    /- production[\s\S]*always\(\)[\s\S]*needs\.select\.outputs\.action == 'record'[\s\S]*needs\.select\.outputs\.action == 'deploy' && needs\.production\.result == 'success'[\s\S]*environment: Production[\s\S]*command: sync/u,
  );
  assert.match(
    finalize,
    /- linear_production[\s\S]*needs\.linear_production\.result == 'success'/u,
  );
  assert.match(finalize, /needs\.select\.outputs\.action == 'record'/u);
  assert.match(
    finalize,
    /needs\.select\.outputs\.action == 'deploy' && needs\.production\.result == 'success'/u,
  );
  assert.match(noChange, /if: needs\.select\.outputs\.action == 'noop'/u);
  assert.doesNotMatch(linearPreview, /action == 'noop'/u);
  assert.doesNotMatch(linearProduction, /action == 'noop'/u);
  assert.doesNotMatch(finalize, /action == 'noop'/u);
  for (const release of [linearPreview, linearProduction]) {
    assert.match(release, /ref: \$\{\{ needs\.select\.outputs\.deploy_sha \}\}/u);
    assert.match(release, /fetch-depth: 0/u);
    assert.match(release, /persist-credentials: false/u);
    assert.match(
      release,
      /command: sync[\s\S]*version: \$\{\{ needs\.select\.outputs\.deploy_sha \}\}/u,
    );
    assert.match(release, /base_ref: refs\/remotes\/origin\/production/u);
    assert.match(release, /access_key: \$\{\{ secrets\.LINEAR_ACCESS_KEY \}\}/u);
    assert.match(release, /uses: linear\/linear-release-action@[0-9a-f]{40} # v0\.14\.5/u);
    assert.match(release, /Daily Release=\$\{\{ github\.server_url \}\}/u);
  }
  assert.doesNotMatch(daily, /linear-release-stage\.yml/u);
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
  assert.match(
    previewSmoke,
    /outputs:\n\s+proof_passed:[\s\S]*value: \$\{\{ jobs\.smoke\.outputs\.proof_passed \}\}/u,
  );
  assert.match(
    previewSmoke,
    /outputs:\n\s+proof_passed: \$\{\{ steps\.preview_proofs\.outcome == 'success' && steps\.artifact_sweep\.outcome == 'success' \}\}/u,
  );
  assert.match(previewSmoke, /id: preview_proofs\n\s+continue-on-error: true/u);
  assert.match(
    previewSmoke,
    /id: artifact_sweep\n\s+if: \$\{\{ always\(\) \}\}\n\s+continue-on-error: true/u,
  );
  assert.match(deployPreview, /group: preview-fleet\n\s+cancel-in-progress: false/u);
  assert.match(previewSmoke, /group: preview-fleet\n\s+cancel-in-progress: false/u);
  assert.match(previewSmokeConfig, /^\s*workers\s*:\s*3\s*(?:,|$)/mu);
  assert.match(
    previewSmoke,
    /sweep:r2-backup &\n\s+r2_pid=\$!\n\s+unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN\n[\s\S]*pnpm smoke:preview/u,
  );
  assert.match(previewSmoke, /wait "\$r2_pid"[\s\S]*r2_status=\$\?/u);
  const tokenUnset = previewSmoke.indexOf("unset CLOUDFLARE_ACCOUNT_ID");
  const applicationSmoke = previewSmoke.slice(
    previewSmoke.indexOf("\n", tokenUnset) + 1,
    previewSmoke.indexOf('wait "$r2_pid"'),
  );
  assert.doesNotMatch(applicationSmoke, /CLOUDFLARE_API_TOKEN/u);
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

test("production verifies live identity and uses the exact Sentry release identity", async () => {
  const production = await workflow("deploy-production.yml");

  assert.match(production, /fetch-depth: 0/u);
  assert.match(production, /SENTRY_RELEASE: \$\{\{ env\.RELEASE_ID \}\}/u);
  assert.match(
    production,
    /EXPECTED_SHA: \$\{\{ env\.RELEASE_ID \}\}[\s\S]*node \.release-orchestrator\/scripts\/ci\/verify-production-health\.mjs\n\s+"\$EXPECTED_SHA"/u,
  );
  assert.doesNotMatch(production, /linear-release-action|LINEAR_ACCESS_KEY/u);

  const sentry = production.indexOf("- name: Verify Sentry source maps for production release");
  const health = production.indexOf("- name: Verify production fleet identity");
  assert.ok(sentry >= 0 && health > sentry);
});
