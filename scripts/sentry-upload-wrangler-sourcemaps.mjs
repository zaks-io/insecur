#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runSentryCli } from "./sentry-cli.mjs";
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

  runSentryCli(
    [
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
    ],
    config,
    { env },
  );

  return { action: "upload", release: config.release, sourceMapDir };
}

export async function hasSourceMap(directory) {
  const pending = [directory];

  while (pending.length > 0) {
    const current = pending.pop();
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") {
        if (current === directory) {
          return false;
        }
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".map")) {
        return true;
      }
    }
  }

  return false;
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
