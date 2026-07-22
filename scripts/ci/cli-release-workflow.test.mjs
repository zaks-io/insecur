import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPromise = readFile(
  new URL("../../.github/workflows/cli-release.yml", import.meta.url),
  "utf8",
);
const bunSqliteSeamProbePromise = readFile(
  new URL("./bun-sqlite-seam-probe.mjs", import.meta.url),
  "utf8",
);

test("all CLI release runs share one non-cancelling concurrency group", async () => {
  const workflow = await workflowPromise;

  assert.match(
    workflow,
    /concurrency:\n\s+group: cli-release\n\s+cancel-in-progress: false/u,
    "same-tag dispatches must serialize so guard and mutation cannot interleave",
  );
});

test("CLI release rejects source commits that are not main or a main ancestor", async () => {
  const workflow = await workflowPromise;

  assert.match(
    workflow,
    /name: Require the release source to be main or a main ancestor[\s\S]*?compare\/main\.\.\.\$SOURCE_SHA[\s\S]*?"\$status" != "identical" \] && \[ "\$status" != "behind"[\s\S]*?exit 1/u,
  );
  assert.match(
    workflow,
    /Require the release source to be main or a main ancestor[\s\S]*Require successful CI for manual release dispatch/u,
    "the main-ancestry gate must run before the CI-success gate in verify-source-ci",
  );
});

test("every checkout and release target is pinned to the verified source SHA", async () => {
  const workflow = await workflowPromise;

  const checkouts = workflow.match(/uses: actions\/checkout@/gu) ?? [];
  const pinnedRefs =
    workflow.match(/ref: \$\{\{ needs\.verify-source-ci\.outputs\.source_sha \}\}/gu) ?? [];
  assert.ok(checkouts.length >= 3, "expected checkouts in detect, build, and release jobs");
  assert.equal(
    pinnedRefs.length,
    checkouts.length,
    "every checkout must pin ref to the verified source SHA",
  );

  for (const target of workflow.matchAll(/--target "(?<sha>[^"]+)"/gu)) {
    assert.equal(target.groups.sha, "$RELEASE_SHA");
  }
  assert.match(workflow, /RELEASE_SHA: \$\{\{ needs\.verify-source-ci\.outputs\.source_sha \}\}/u);
});

test("same-version draft mutation is guarded by the source SHA marker before any edit or upload", async () => {
  const workflow = await workflowPromise;

  assert.match(
    workflow,
    /cli-release-draft-guard\.mjs --tag "\$TAG" --source-sha "\$RELEASE_SHA"\n\s+gh release edit "\$TAG"/u,
    "the draft guard must run immediately before gh release edit",
  );
  assert.match(
    workflow,
    /cli-release-draft-guard\.mjs[\s\S]*gh release edit[\s\S]*gh release delete-asset[\s\S]*gh release upload/u,
    "asset deletion and clobber upload must stay behind the draft guard",
  );
  assert.match(
    workflow,
    /cli-release-draft-guard\.mjs --tag "\$TAG" --source-sha "\$SOURCE_SHA"/u,
    "the prepare job must fail fast on a same-version draft bound to a different SHA",
  );
});

test("draft creation records the verified source SHA in the release notes", async () => {
  const workflow = await workflowPromise;

  assert.match(
    workflow,
    /cli-release-notes\.mjs \\\n\s+--tag "\$TAG" \\\n\s+--release-sha "\$RELEASE_SHA"/u,
  );
});

test("compiled binary smoke explicitly opts into the disposable file keystore", async () => {
  const workflow = await workflowPromise;

  assert.match(
    workflow,
    /- name: Smoke compiled binary[\s\S]*?INSECUR_ALLOW_INSECURE_FILE_KEYSTORE: "1"/u,
    "ephemeral release runners have no guaranteed OS credential store",
  );
});

test("Bun sqlite seam probe does not fail passed assertions on disposable cleanup locks", async () => {
  const probe = await bunSqliteSeamProbePromise;

  assert.match(
    probe,
    /catch \(error\) \{[\s\S]*?if \(!isDisposableCleanupLock\(error\)\) \{\s*throw error;\s*\}[\s\S]*?console\.warn/u,
  );
});

test("CLI releases sync the package version to Linear with the isolated credential and CLI path filter", async () => {
  const workflow = await workflowPromise;
  const cliReleasePaths =
    "packages/access/**,packages/agent-attribution/**,packages/audit/**,packages/auth/**,packages/cli/**,packages/crypto/**,packages/custody-contracts/**,packages/domain/**,packages/instance-bootstrap/**,packages/local-store/**,packages/observability/**,packages/onboarding/**,packages/operations/**,packages/runtime-injection-issue/**,packages/secret-store-contracts/**,packages/tenant-store/**,packages/token-signing/**,packages/worker-kit/**";

  assert.match(
    workflow,
    /release:[\s\S]*?environment: Production[\s\S]*?- name: Sync CLI release to Linear[\s\S]*?uses: linear\/linear-release-action@[0-9a-f]{40} # v0\.14\.5[\s\S]*?access_key: \$\{\{ secrets\.CLI_LINEAR_ACCESS_KEY \}\}[\s\S]*?version: \$\{\{ steps\.linear-cli-release\.outputs\.version \}\}[\s\S]*?release_notes: dist-binaries\/RELEASE_NOTES\.md/u,
  );
  assert.ok(workflow.includes(`include_paths: "${cliReleasePaths}"`));
  assert.doesNotMatch(workflow, /include_paths: "[^"]*apps\//u);

  const draftRelease = workflow.indexOf("- name: Create or update draft release");
  const linearSync = workflow.indexOf("- name: Sync CLI release to Linear");
  assert.ok(draftRelease >= 0 && linearSync > draftRelease);
});
