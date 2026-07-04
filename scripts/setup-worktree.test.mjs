import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  discoverPrivateEnvFiles,
  isPrivateEnvFile,
  parseArgs,
  parseWorktreeList,
  selectSourceWorktree,
} from "./setup-worktree.mjs";

test("parses setup options", () => {
  assert.deepEqual(parseArgs(["--", "--source", "/repo", "--dry-run", "--reset-db"]), {
    dryRun: true,
    force: true,
    install: true,
    resetDb: true,
    runDevCheck: true,
    source: "/repo",
  });
  assert.equal(parseArgs(["--no-overwrite", "--skip-install", "--skip-dev-check"]).force, false);
  assert.throws(() => parseArgs(["--source"]), /--source requires a value/u);
});

test("selects the main worktree as env source", () => {
  const records = parseWorktreeList(`worktree /repo
HEAD abc
branch refs/heads/main

worktree /repo/.codex/worktrees/1234/insecur
HEAD def
branch refs/heads/feature
`);

  assert.equal(selectSourceWorktree(records), "/repo");
});

test("keeps the primary worktree as source when the target is primary", () => {
  const records = parseWorktreeList(`worktree /repo
HEAD abc
branch refs/heads/main

worktree /tmp/other
HEAD def
detached
`);

  assert.equal(selectSourceWorktree(records), "/repo");
});

test("detects private env files and skips examples and nested worktrees", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "insecur-worktree-env-"));

  try {
    writeFileSync(path.join(root, ".env.local"), "A=1\n");
    writeFileSync(path.join(root, ".env.preview"), "B=1\n");
    writeFileSync(path.join(root, ".env.example"), "EXAMPLE=1\n");
    mkdirSync(path.join(root, "apps", "api"), { recursive: true });
    writeFileSync(path.join(root, "apps", "api", ".dev.vars"), "C=1\n");
    writeFileSync(path.join(root, "apps", "api", ".dev.vars.example"), "EXAMPLE=1\n");
    mkdirSync(path.join(root, ".claude", "worktrees", "nested"), { recursive: true });
    writeFileSync(path.join(root, ".claude", "worktrees", "nested", ".env.local"), "NESTED=1\n");

    assert.deepEqual(discoverPrivateEnvFiles(root), [
      ".env.local",
      ".env.preview",
      path.join("apps", "api", ".dev.vars"),
    ]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("classifies only non-example env files as private", () => {
  assert.equal(isPrivateEnvFile(".env"), true);
  assert.equal(isPrivateEnvFile(".env.local"), true);
  assert.equal(isPrivateEnvFile(".env.example"), false);
  assert.equal(isPrivateEnvFile(".dev.vars"), true);
  assert.equal(isPrivateEnvFile(".dev.vars.example"), false);
  assert.equal(isPrivateEnvFile("README.md"), false);
});
