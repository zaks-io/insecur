#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveSentrySourcemapConfig } from "./sentry-sourcemap-config.mjs";

export async function uploadWranglerSourcemaps(sourceMapDir, env = process.env) {
  const config = resolveSentrySourcemapConfig(env);

  if (config.action === "skip") {
    console.log("SENTRY_AUTH_TOKEN is not set; skipping Sentry source map upload.");
    return { action: "skip", reason: "missing_auth_token" };
  }

  if (!(await hasSourceMap(sourceMapDir))) {
    if (env.INSECUR_REQUIRE_SENTRY_SOURCEMAPS === "true") {
      throw new Error(
        `No source maps found in ${sourceMapDir}; required Sentry source map upload cannot be skipped.`,
      );
    }
    console.log(`No source maps found in ${sourceMapDir}; skipping Sentry source map upload.`);
    return { action: "skip", reason: "missing_source_maps" };
  }

  await runSentryCli([
    "sourcemaps",
    "upload",
    "--org",
    config.org,
    "--project",
    config.project,
    "--release",
    config.release,
    "--strip-prefix",
    path.resolve(sourceMapDir, ".."),
    sourceMapDir,
  ]);

  return { action: "upload", release: config.release, sourceMapDir };
}

export async function hasSourceMap(directory) {
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

export function runSentryCli(args) {
  const command = process.platform === "win32" ? "sentry-cli.cmd" : "sentry-cli";
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sentry-cli ${args[0]} failed with exit code ${result.status}.`);
  }
}

async function main() {
  const sourceMapDir = path.resolve(process.cwd(), process.argv[2] ?? "dist");
  await uploadWranglerSourcemaps(sourceMapDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
