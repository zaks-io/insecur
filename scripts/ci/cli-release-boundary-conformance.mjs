#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_RELEASE_ENTRY = path.join(REPO_ROOT, "packages", "cli", "dist", "index.js");
const CI_WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");
const execFileAsync = promisify(execFile);

async function runDependencyCruiser(args) {
  try {
    await execFileAsync("pnpm", args, { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    const result = error && typeof error === "object" ? error : {};
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const output = [stdout, stderr].filter(Boolean).join("\n");
    throw new Error(output || "dependency-cruiser exited with a non-zero status");
  }
}

async function assertReleaseEntryHasNoPrivateImports() {
  const configDir = await mkdtemp(path.join(os.tmpdir(), "insecur-cli-release-boundary-"));
  const configPath = path.join(configDir, "dependency-cruiser.config.cjs");
  const config = {
    forbidden: [
      {
        name: "cli-release-no-private-workspace-imports",
        comment:
          "The built CLI release entry must be self-contained and must not import private @insecur/* workspace packages.",
        severity: "error",
        from: { path: "(^|/)packages/cli/dist/index\\.js$" },
        to: { reachable: true, path: "^@insecur/" },
      },
    ],
    options: { doNotFollow: { path: "node_modules" }, progress: { type: "none" } },
  };

  await writeFile(configPath, `module.exports = ${JSON.stringify(config, null, 2)};\n`, "utf8");
  try {
    await runDependencyCruiser([
      "exec",
      "depcruise",
      CLI_RELEASE_ENTRY,
      "--config",
      configPath,
      "--output-type",
      "err",
      "--progress",
      "none",
    ]);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
}

async function assertHostedCiRunsCliReleaseBoundaryConformance() {
  const workflow = await readFile(CI_WORKFLOW_PATH, "utf8");
  const verifyJobMatch = workflow.match(
    /^\s+verify:\s*\n[\s\S]*?^\s+run:\s*\|\s*\n((?:\s{10}.*\n)+)/m,
  );
  if (!verifyJobMatch) {
    throw new Error(
      "CLI release boundary conformance: could not locate CI Verify job run block in .github/workflows/ci.yml",
    );
  }
  if (!/\bpnpm\s+conformance:cli-release-boundary\b/.test(verifyJobMatch[1])) {
    throw new Error(
      "CLI release boundary conformance: hosted CI Verify must run `pnpm conformance:cli-release-boundary`",
    );
  }
}

async function main() {
  await assertHostedCiRunsCliReleaseBoundaryConformance();
  await assertReleaseEntryHasNoPrivateImports();
  console.log("CLI release boundary conformance passed with dependency-cruiser.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
