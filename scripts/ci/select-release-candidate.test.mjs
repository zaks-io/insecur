import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCandidateNotBehindVerifiedLive,
  assertReleaseAncestry,
  buildReleaseCandidateEvidence,
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

test("keeps the newest successful rerun for the selected commit", () => {
  const selected = selectNewestSuccessfulMainRun(
    [
      run({ id: 21, updated_at: "2026-07-17T11:00:00Z" }),
      run({ id: 23, updated_at: "2026-07-17T13:00:00Z" }),
      run({ id: 22, updated_at: "2026-07-17T12:00:00Z" }),
    ],
    [NEW_SHA],
  );
  assert.equal(selected.id, 23);
});

test("fails closed when no successful main run exists", () => {
  assert.throws(
    () => selectNewestSuccessfulMainRun([run({ conclusion: "failure" })], [NEW_SHA]),
    /No completed successful CI run/u,
  );
});

test("fails closed when the newest API candidate is absent from local main history", () => {
  assert.throws(
    () =>
      selectNewestSuccessfulMainRun(
        [run(), run({ head_sha: OLD_SHA, id: 11, updated_at: "2026-07-17T11:00:00Z" })],
        [OLD_SHA],
      ),
    /Refresh origin\/main before selecting a release/u,
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

test("rejects a candidate behind a verified live deployment", () => {
  assert.doesNotThrow(() =>
    assertReleaseAncestry({
      candidateSha: OLD_SHA,
      mainSha: NEW_SHA,
      productionSha: NEW_SHA,
      isAncestor: (ancestor, descendant) =>
        ancestor === descendant || (ancestor === OLD_SHA && descendant === NEW_SHA),
    }),
  );
  assert.throws(
    () =>
      assertCandidateNotBehindVerifiedLive({
        candidateSha: OLD_SHA,
        liveSha: NEW_SHA,
        verifiedLiveRun: true,
        isAncestor: (ancestor, descendant) => ancestor === OLD_SHA && descendant === NEW_SHA,
      }),
    /refusing to roll production back/u,
  );
  assert.doesNotThrow(() =>
    assertCandidateNotBehindVerifiedLive({
      candidateSha: OLD_SHA,
      liveSha: NEW_SHA,
      verifiedLiveRun: false,
      isAncestor: () => true,
    }),
  );
  assert.throws(
    () =>
      decideReleaseAction({
        candidateSha: OLD_SHA,
        liveSha: OLD_SHA,
        productionSha: NEW_SHA,
        relation: "production-ahead",
        verifiedLiveRun: true,
      }),
    /ledger is ahead, but its live deployment is not verified/u,
  );
});

test("records the exact candidate, main, production, and live identities", () => {
  assert.deepEqual(
    buildReleaseCandidateEvidence({
      action: "record",
      candidate: { head_sha: NEW_SHA, id: 22 },
      live: { deploySha: NEW_SHA, runId: "123" },
      mainSha: NEW_SHA,
      productionSha: OLD_SHA,
      verifiedLiveRun: true,
    }),
    {
      action: "record",
      ci_run_id: "22",
      deploy_sha: NEW_SHA,
      live_run_id: "123",
      live_run_verified: "true",
      live_sha: NEW_SHA,
      main_sha: NEW_SHA,
      production_sha: OLD_SHA,
    },
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
      productionSha: NEW_SHA,
      relation: "same",
      verifiedLiveRun: false,
    }),
    "deploy",
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
