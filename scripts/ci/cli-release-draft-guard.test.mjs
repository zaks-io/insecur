import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDraftBoundToSourceSha,
  fetchRelease,
  parseArgs,
} from "./cli-release-draft-guard.mjs";
import {
  buildReleaseNotesMarkdown,
  buildReleaseSourceShaMarker,
  extractReleaseSourceSha,
} from "./cli-release-notes-lib.mjs";

const MAIN_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

test("guard args require a tag and a full 40-character source SHA", () => {
  const args = parseArgs(["--tag", "cli-v0.2.0", "--source-sha", MAIN_SHA]);
  assert.deepEqual(args, { tag: "cli-v0.2.0", sourceSha: MAIN_SHA });

  assert.throws(() => parseArgs(["--source-sha", MAIN_SHA]), /--tag is required/u);
  assert.throws(() => parseArgs(["--tag", "cli-v0.2.0"]), /--source-sha is required/u);
  assert.throws(
    () => parseArgs(["--tag", "cli-v0.2.0", "--source-sha", MAIN_SHA.slice(0, 8)]),
    /full 40-character commit SHA/u,
  );
});

test("mutating a same-SHA draft is allowed", () => {
  const body = buildReleaseNotesMarkdown("- Added clearer status output.", MAIN_SHA);
  assert.equal(
    assertDraftBoundToSourceSha({ tag: "cli-v0.2.0", isDraft: true, body, sourceSha: MAIN_SHA }),
    MAIN_SHA,
  );
});

test("same-version different-SHA draft mutation fails closed", () => {
  const body = buildReleaseNotesMarkdown("- Added clearer status output.", MAIN_SHA);
  assert.throws(
    () =>
      assertDraftBoundToSourceSha({ tag: "cli-v0.2.0", isDraft: true, body, sourceSha: OTHER_SHA }),
    new RegExp(`bound to source SHA ${MAIN_SHA}; refusing to mutate it from ${OTHER_SHA}`, "u"),
  );
});

test("a draft without a durable source SHA marker fails closed", () => {
  assert.throws(
    () =>
      assertDraftBoundToSourceSha({
        tag: "cli-v0.2.0",
        isDraft: true,
        body: "## What's changed\n\n- Legacy draft without provenance marker.",
        sourceSha: MAIN_SHA,
      }),
    /no recorded source SHA marker/u,
  );
});

test("a published release is never mutated, even with a matching SHA", () => {
  const body = buildReleaseNotesMarkdown("- Added clearer status output.", MAIN_SHA);
  assert.throws(
    () =>
      assertDraftBoundToSourceSha({ tag: "cli-v0.2.0", isDraft: false, body, sourceSha: MAIN_SHA }),
    /published; refusing to mutate/u,
  );
});

test("source SHA marker round-trips through the release notes body", () => {
  assert.equal(extractReleaseSourceSha(buildReleaseNotesMarkdown("- One", MAIN_SHA)), MAIN_SHA);
  assert.equal(extractReleaseSourceSha("no marker here"), null);
  assert.equal(extractReleaseSourceSha(null), null);
  assert.throws(() => buildReleaseSourceShaMarker("HEAD"), /full 40-character commit SHA/u);
  assert.throws(() => buildReleaseSourceShaMarker(MAIN_SHA.toUpperCase()), /full 40-character/u);
});

test("release lookup queries gh for draft status and body only", async () => {
  const calls = [];
  const release = await fetchRelease("cli-v0.2.0", {
    execFileAsync: async (command, args) => {
      calls.push([command, args]);
      return { stdout: JSON.stringify({ isDraft: true, body: "body" }), stderr: "" };
    },
  });

  assert.deepEqual(release, { isDraft: true, body: "body" });
  assert.deepEqual(calls, [["gh", ["release", "view", "cli-v0.2.0", "--json", "isDraft,body"]]]);
});
