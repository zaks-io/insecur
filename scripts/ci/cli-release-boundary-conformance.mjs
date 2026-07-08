#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

import { execFileForOutput } from "./exec-file-output.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_RELEASE_ENTRY = path.join(REPO_ROOT, "packages", "cli", "dist", "index.js");
const CLI_RELEASE_HASHBANG = "#!/usr/bin/env node";
const CI_WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");
const PRIVATE_WORKSPACE_MODULE_PATH =
  "(^|/)(?:(?:packages|apps)/(?!cli(?:/|$))[^/]+/(?:src|dist)/|node_modules/(?:\\.pnpm/)?@insecur(?:/|\\+))";

async function runDependencyCruiser(args) {
  await execFileForOutput("pnpm", args, {
    cwd: REPO_ROOT,
    failureMessage: "dependency-cruiser exited with a non-zero status",
    maxBuffer: 10 * 1024 * 1024,
  });
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
        to: { reachable: true, path: PRIVATE_WORKSPACE_MODULE_PATH },
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

async function assertReleaseEntryHasValidHashbang() {
  const source = await readFile(CLI_RELEASE_ENTRY, "utf8");
  const lines = source.split(/\r?\n/);
  if (lines[0] !== CLI_RELEASE_HASHBANG) {
    throw new Error(
      `CLI release boundary conformance: ${CLI_RELEASE_ENTRY} must start with ${CLI_RELEASE_HASHBANG}`,
    );
  }
  const extraHashbangLine = lines.findIndex((line, index) => index > 0 && line.startsWith("#!"));
  if (extraHashbangLine !== -1) {
    throw new Error(
      `CLI release boundary conformance: ${CLI_RELEASE_ENTRY} has an extra hashbang on line ${
        extraHashbangLine + 1
      }`,
    );
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

async function assertHostedCiRunsCliReleaseBoundaryConformance() {
  const workflow = parseYaml(await readFile(CI_WORKFLOW_PATH, "utf8"));
  const steps =
    isRecord(workflow) && isRecord(workflow.jobs) && isRecord(workflow.jobs.verify)
      ? workflow.jobs.verify.steps
      : null;
  if (!Array.isArray(steps)) {
    throw new Error(
      "CLI release boundary conformance: could not locate CI Verify job steps in .github/workflows/ci.yml",
    );
  }
  const verifyRunBlocks = steps
    .map((step) => (isRecord(step) && typeof step.run === "string" ? step.run : ""))
    .filter(Boolean);
  if (
    !verifyRunBlocks.some((runBlock) =>
      /\bpnpm\s+conformance:cli-release-boundary\b/.test(runBlock),
    )
  ) {
    throw new Error(
      "CLI release boundary conformance: hosted CI Verify must run `pnpm conformance:cli-release-boundary`",
    );
  }
}

async function main() {
  await assertHostedCiRunsCliReleaseBoundaryConformance();
  await assertReleaseEntryHasValidHashbang();
  await assertReleaseEntryHasNoPrivateImports();
  console.log("CLI release boundary conformance passed with dependency-cruiser.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
