import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production requires a successful real preview smoke with exact-SHA identity proof", async () => {
  const production = await readFile(
    new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );
  const previewSmoke = await readFile(
    new URL("../../.github/workflows/preview-smoke.yml", import.meta.url),
    "utf8",
  );

  assert.match(production, /actions\/workflows\/preview-smoke\.yml\/runs\?head_sha=\$DEPLOY_SHA/u);
  assert.match(production, /\.conclusion == "success"/u);
  assert.match(
    production,
    /gh run download "\$PREVIEW_SMOKE_RUN_ID" --name preview-smoke-artifacts/u,
  );
  // pnpm --filter runs the verifier with cwd=packages/release-gate, so a relative
  // evidence path resolves inside the package and fails against real evidence (INS-601).
  assert.match(
    production,
    /verify-preview-smoke-identity\s+\\\n\s+--evidence "\$GITHUB_WORKSPACE\/\$proof_path"/u,
  );
  assert.doesNotMatch(production, /--evidence "\$proof_path"/u);
  assert.match(production, /--expected-sha "\$DEPLOY_SHA"/u);
  assert.match(previewSmoke, /SMOKE_EXPECTED_DEPLOY_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(previewSmoke, /group: preview-fleet/u);
  assert.doesNotMatch(previewSmoke, /inputs\.expected_sha/u);
});

test("preview deploy and smoke serialize access to the shared fleet", async () => {
  const deployPreview = await readFile(
    new URL("../../.github/workflows/deploy-preview.yml", import.meta.url),
    "utf8",
  );
  const previewSmoke = await readFile(
    new URL("../../.github/workflows/preview-smoke.yml", import.meta.url),
    "utf8",
  );

  assert.match(deployPreview, /group: preview-fleet\n\s+cancel-in-progress: false/u);
  assert.match(previewSmoke, /group: preview-fleet\n\s+cancel-in-progress: false/u);
});

test("production reports incomplete launch evidence without blocking prelaunch deploys", async () => {
  const production = await readFile(
    new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    production,
    /release-gate:bundle -- --profile small_group_production --evidence-dir "\$GITHUB_WORKSPACE\/evidence" --warn-only/u,
  );
  assert.match(production, /::warning::Small-group production evidence is advisory/u);
  assert.doesNotMatch(production, /continue-on-error:\s*true/u);
});

test("production uses one release identity for Sentry and Linear", async () => {
  const production = await readFile(
    new URL("../../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    production,
    /RELEASE_ID: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/u,
  );
  assert.match(production, /fetch-depth: 0/u);
  assert.match(production, /SENTRY_RELEASE: \$\{\{ env\.RELEASE_ID \}\}/u);
  assert.match(production, /uses: linear\/linear-release-action@[0-9a-f]{40} # v0\.14\.5/u);
  assert.match(production, /access_key: \$\{\{ secrets\.LINEAR_ACCESS_KEY \}\}/u);
  assert.match(production, /name: \$\{\{ env\.RELEASE_ID \}\}/u);
  assert.match(production, /version: \$\{\{ env\.RELEASE_ID \}\}/u);

  const sentryVerification = production.indexOf(
    "- name: Verify Sentry source maps for production release",
  );
  const linearSync = production.indexOf("- name: Sync production release to Linear");
  assert.ok(sentryVerification >= 0 && linearSync > sentryVerification);
});
