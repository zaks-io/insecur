import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertCandidateNotBehindVerifiedLive,
  assertReleaseAncestry,
  buildReleaseCandidateEvidence,
  decideReleaseAction,
  gitIsAncestor,
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

test("accepts equal or older verified live deployments and rejects divergent live history", () => {
  const isAncestor = (ancestor, descendant) =>
    ancestor === descendant || (ancestor === OLD_SHA && descendant === NEW_SHA);
  for (const liveSha of [OLD_SHA, NEW_SHA]) {
    assert.doesNotThrow(() =>
      assertCandidateNotBehindVerifiedLive({
        candidateSha: NEW_SHA,
        isAncestor,
        liveSha,
        verifiedLiveRun: true,
      }),
    );
  }
  assert.throws(
    () =>
      assertCandidateNotBehindVerifiedLive({
        candidateSha: NEW_SHA,
        isAncestor,
        liveSha: "3".repeat(40),
        verifiedLiveRun: true,
      }),
    /have diverged; refusing to deploy/u,
  );
});

test("fails closed when Git cannot resolve the verified live commit", (t) => {
  // Hooks export routing/config variables that override Git's cwd. Run this
  // fixture in a clean child before any Git command can reach the parent repo.
  if (Object.keys(process.env).some((key) => key.startsWith("GIT_"))) {
    execFileSync(
      process.execPath,
      [
        "--test",
        "--test-name-pattern=fails closed when Git cannot resolve",
        fileURLToPath(import.meta.url),
      ],
      { env: cleanGitEnv(), stdio: "pipe" },
    );
    return;
  }
  const cwd = mkdtempSync(path.join(tmpdir(), "insecur-release-ancestry-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf8",
    }).trim();
  git("init", "--quiet");
  const commit = () => {
    git(
      "-c",
      "user.name=Release test",
      "-c",
      "user.email=release@example.test",
      "commit",
      "--allow-empty",
      "--quiet",
      "-m",
      "Release fixture",
    );
    return git("rev-parse", "HEAD");
  };
  const oldSha = commit();
  const newSha = commit();
  const isAncestor = (ancestor, descendant) => gitIsAncestor(ancestor, descendant, cwd);
  assert.equal(isAncestor(oldSha, newSha), true);
  assert.equal(isAncestor(newSha, oldSha), false);
  assert.throws(
    () =>
      assertCandidateNotBehindVerifiedLive({
        candidateSha: oldSha,
        isAncestor,
        liveSha: NEW_SHA,
        verifiedLiveRun: true,
      }),
    /Cannot verify Git ancestry/u,
  );
  assert.throws(
    () =>
      assertCandidateNotBehindVerifiedLive({
        candidateSha: oldSha,
        isAncestor,
        liveSha: newSha,
        verifiedLiveRun: true,
      }),
    /refusing to roll production back/u,
  );
  assert.doesNotThrow(() =>
    assertCandidateNotBehindVerifiedLive({
      candidateSha: newSha,
      isAncestor,
      liveSha: oldSha,
      verifiedLiveRun: true,
    }),
  );
});

function cleanGitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
}

test("isolates real-Git fixtures from inherited hook repository routing", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "insecur-release-hook-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = cleanGitEnv();
  execFileSync("git", ["init", "--quiet"], { cwd, env });
  const gitDir = path.join(cwd, ".git");
  execFileSync(
    process.execPath,
    [
      "--test",
      "--test-name-pattern=fails closed when Git cannot resolve",
      fileURLToPath(import.meta.url),
    ],
    {
      env: {
        ...env,
        GIT_DIR: gitDir,
        GIT_WORK_TREE: cwd,
        GIT_COMMON_DIR: gitDir,
        GIT_INDEX_FILE: path.join(gitDir, "index"),
        GIT_OBJECT_DIRECTORY: path.join(gitDir, "objects"),
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "commit.gpgsign",
        GIT_CONFIG_VALUE_0: "false",
      },
      stdio: "pipe",
    },
  );
  assert.throws(
    () => execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd, env, stdio: "pipe" }),
    /Command failed/u,
  );
});

test("Git ancestry fixture never invokes global signing or hooks", (t) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "insecur-release-global-config-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const configDir = path.join(cwd, "git");
  const hooksDir = path.join(cwd, "hooks");
  mkdirSync(configDir);
  mkdirSync(hooksDir);
  const signer = path.join(cwd, "signer");
  const hook = path.join(hooksDir, "pre-commit");
  for (const script of [signer, hook]) {
    writeFileSync(script, '#!/bin/sh\nprintf invoked > "$0.called"\nexit 1\n', { mode: 0o700 });
  }
  const config = `[commit]\n  gpgsign = true\n[gpg]\n  program = ${JSON.stringify(signer)}\n[core]\n  hooksPath = ${JSON.stringify(hooksDir)}\n`;
  const configFile = path.join(configDir, "config");
  writeFileSync(configFile, config);
  const env = { ...cleanGitEnv(), XDG_CONFIG_HOME: cwd };
  const git = (...args) => execFileSync("git", args, { env, encoding: "utf8" }).trim();
  const callerHead = git("rev-parse", "HEAD");
  assert.equal(git("config", "--get", "commit.gpgsign"), "true");
  assert.equal(git("config", "--get", "gpg.program"), signer);
  assert.equal(git("config", "--get", "core.hooksPath"), hooksDir);
  execFileSync(
    process.execPath,
    [
      "--test",
      "--test-name-pattern=fails closed when Git cannot resolve",
      fileURLToPath(import.meta.url),
    ],
    { env, stdio: "pipe" },
  );
  assert.equal(existsSync(`${signer}.called`), false);
  assert.equal(existsSync(`${hook}.called`), false);
  assert.equal(readFileSync(configFile, "utf8"), config);
  assert.equal(git("rev-parse", "HEAD"), callerHead);
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
      candidateSha: OLD_SHA,
      liveSha: NEW_SHA,
      productionSha: NEW_SHA,
      relation: "production-ahead",
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
