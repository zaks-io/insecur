#!/usr/bin/env node
/**
 * Install lefthook git hooks when the repo uses the default hooks path.
 * Cursor Cloud Agent and other environments may set core.hooksPath; skip there.
 */
import { execFileSync } from "node:child_process";

if (process.env.LEFTHOOK === "0" || process.env.CI === "true") {
  process.exit(0);
}

function gitOutput(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

let hooksPath = "";
try {
  hooksPath = gitOutput(["config", "--local", "--get", "core.hooksPath"]);
} catch {
  hooksPath = "";
}

if (hooksPath.length > 0 && !hooksPath.endsWith(".git/hooks")) {
  console.warn(
    `lefthook install skipped: core.hooksPath is set to a non-default path (${hooksPath}).`,
  );
  process.exit(0);
}

// In a linked git worktree, core.hooksPath points at the main repo's hooks dir,
// which lefthook refuses to manage from here. Skip cleanly instead of failing install.
let gitDir = "";
let commonDir = "";
try {
  gitDir = gitOutput(["rev-parse", "--absolute-git-dir"]);
  commonDir = gitOutput(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
} catch {
  gitDir = "";
  commonDir = "";
}

if (gitDir.length > 0 && commonDir.length > 0 && gitDir !== commonDir) {
  console.warn("lefthook install skipped: linked git worktree shares the main repo's hooks path.");
  process.exit(0);
}

execFileSync("pnpm", ["run", "lefthook:install"], { stdio: "inherit" });
