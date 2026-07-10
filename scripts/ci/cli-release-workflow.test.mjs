import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPromise = readFile(
  new URL("../../.github/workflows/cli-release.yml", import.meta.url),
  "utf8",
);

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
