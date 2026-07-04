#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const sourceMapDir = path.resolve(process.cwd(), process.argv[2] ?? "dist");

if (!process.env.SENTRY_AUTH_TOKEN) {
  console.log("SENTRY_AUTH_TOKEN is not set; skipping Sentry source map upload.");
  process.exit(0);
}

const release = process.env.SENTRY_RELEASE ?? process.env.INSECUR_DEPLOY_SHA;
if (!release) {
  throw new Error("SENTRY_RELEASE or INSECUR_DEPLOY_SHA is required for Sentry source map upload.");
}

if (!(await hasSourceMap(sourceMapDir))) {
  console.log(`No source maps found in ${sourceMapDir}; skipping Sentry source map upload.`);
  process.exit(0);
}

await runSentryCli([
  "sourcemaps",
  "upload",
  "--org",
  process.env.SENTRY_ORG ?? "zaksio",
  "--project",
  process.env.SENTRY_PROJECT ?? "insecur",
  "--release",
  release,
  "--strip-prefix",
  path.resolve(sourceMapDir, ".."),
  sourceMapDir,
]);

async function hasSourceMap(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && (await hasSourceMap(entryPath))) {
        return true;
      }
      if (entry.isFile() && entry.name.endsWith(".map")) {
        return true;
      }
    }
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function runSentryCli(args) {
  const command = process.platform === "win32" ? "sentry-cli.cmd" : "sentry-cli";
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sentry-cli ${args[0]} failed with exit code ${result.status}.`);
  }
}
