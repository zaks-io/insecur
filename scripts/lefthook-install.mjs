#!/usr/bin/env node
/**
 * Install lefthook git hooks when the repo uses the default hooks path.
 * Cursor Cloud Agent and other environments may set core.hooksPath; skip there.
 */
import { execFileSync, execSync } from "node:child_process";

if (process.env.LEFTHOOK === "0" || process.env.CI === "true") {
  process.exit(0);
}

let hooksPath = "";
try {
  hooksPath = execSync("git config --local --get core.hooksPath", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  hooksPath = "";
}

if (hooksPath.length > 0 && !hooksPath.endsWith(".git/hooks")) {
  console.warn(
    `lefthook install skipped: core.hooksPath is set to a non-default path (${hooksPath}).`,
  );
  process.exit(0);
}

execFileSync("pnpm", ["exec", "lefthook", "install"], { stdio: "inherit" });
