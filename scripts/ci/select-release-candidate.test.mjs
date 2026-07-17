import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReleaseAncestry,
  decideReleaseAction,
  parseHealthIdentities,
  selectNewestSuccessfulMainRun,
} from "./select-release-candidate.mjs";

const OLD_SHA = "1".repeat(40);
const NEW_SHA = "2".repeat(40);

function run(overrides = {}) {
  return {
    conclusion: "success",
    event: "push",
    head_branch: "main",
    head_sha: NEW_SHA,
    id: 22,
    updated_at: "2026-07-17T12:00:00Z",
    ...overrides,
  };
}

test("selects the newest successful main push and excludes failed or non-main runs", () => {
  const selected = selectNewestSuccessfulMainRun(
    [
      run({ conclusion: "failure", id: 40, updated_at: "2026-07-17T14:00:00Z" }),
      run({ head_branch: "feature", id: 30, updated_at: "2026-07-17T13:00:00Z" }),
      run(),
      run({ head_sha: OLD_SHA, id: 11, updated_at: "2026-07-17T15:00:00Z" }),
    ],
    [NEW_SHA, OLD_SHA],
  );
  assert.equal(selected.id, 22);
});

test("fails closed when no successful main run exists", () => {
  assert.throws(
    () => selectNewestSuccessfulMainRun([run({ conclusion: "failure" })], [NEW_SHA]),
    /No completed successful CI run/u,
  );
});

test("accepts a fast-forward release and rejects candidate or production divergence", () => {
  assert.doesNotThrow(() =>
    assertReleaseAncestry({
      candidateSha: NEW_SHA,
      mainSha: NEW_SHA,
      productionSha: OLD_SHA,
      isAncestor: (ancestor, descendant) =>
        ancestor === descendant || (ancestor === OLD_SHA && descendant === NEW_SHA),
    }),
  );
  assert.throws(
    () =>
      assertReleaseAncestry({
        candidateSha: NEW_SHA,
        mainSha: NEW_SHA,
        productionSha: OLD_SHA,
        isAncestor: (ancestor, descendant) => ancestor === descendant,
      }),
    /Production .* is not an ancestor of main/u,
  );
});

test("does not roll production back when the newest successful candidate is older", () => {
  assert.doesNotThrow(() =>
    assertReleaseAncestry({
      candidateSha: OLD_SHA,
      mainSha: NEW_SHA,
      productionSha: NEW_SHA,
      isAncestor: (ancestor, descendant) =>
        ancestor === descendant || (ancestor === OLD_SHA && descendant === NEW_SHA),
    }),
  );
  assert.equal(
    decideReleaseAction({
      candidateSha: OLD_SHA,
      liveSha: NEW_SHA,
      productionSha: NEW_SHA,
      relation: "production-ahead",
      verifiedLiveRun: true,
    }),
    "noop",
  );
});

test("selects no-op, branch repair, and deployment actions", () => {
  assert.equal(
    decideReleaseAction({
      candidateSha: NEW_SHA,
      liveSha: NEW_SHA,
      productionSha: NEW_SHA,
      relation: "same",
      verifiedLiveRun: true,
    }),
    "noop",
  );
  assert.equal(
    decideReleaseAction({
      candidateSha: NEW_SHA,
      liveSha: NEW_SHA,
      productionSha: OLD_SHA,
      relation: "candidate-ahead",
      verifiedLiveRun: true,
    }),
    "record",
  );
  assert.equal(
    decideReleaseAction({
      candidateSha: NEW_SHA,
      liveSha: NEW_SHA,
      productionSha: OLD_SHA,
      relation: "candidate-ahead",
      verifiedLiveRun: false,
    }),
    "deploy",
  );
});

test("requires matching production health identities", () => {
  const results = ["insecur-api", "insecur-web", "insecur-site"].map((expectedService) => ({
    expectedService,
    value: { deploySha: NEW_SHA, ok: true, runId: "123", service: expectedService },
  }));
  assert.deepEqual(parseHealthIdentities(results), { deploySha: NEW_SHA, runId: "123" });
  results[2].value.deploySha = OLD_SHA;
  assert.equal(parseHealthIdentities(results), null);
});
