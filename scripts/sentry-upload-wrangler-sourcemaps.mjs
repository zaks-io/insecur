#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runCliMain } from "./cli-exit.mjs";
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
    const entries = await readDirectoryEntries(current, directory);
    if (entries === null) {
      return false;
    }
    if (directoryContainsMap(entries, current, pending)) {
      return true;
    }
  }

  return false;
}

async function readDirectoryEntries(directory, rootDirectory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return directory === rootDirectory ? null : [];
    }
    throw error;
  }
}

function directoryContainsMap(entries, currentDirectory, pending) {
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".map")) {
      return true;
    }
    if (entry.isDirectory()) {
      pending.push(path.join(currentDirectory, entry.name));
    }
  }
  return false;
}

async function main() {
  const sourceMapDir = path.resolve(process.cwd(), process.argv[2] ?? "dist");
  await uploadWranglerSourcemaps(sourceMapDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCliMain(main);
}
