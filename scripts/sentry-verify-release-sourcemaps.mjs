#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { resolveSentrySourcemapConfig } from "./sentry-sourcemap-config.mjs";

const config = resolveSentrySourcemapConfig();

if (config.action === "skip") {
  console.log("SENTRY_AUTH_TOKEN is not set; skipping Sentry source map verification.");
  process.exit(0);
}

const files = listReleaseFiles(config);
if (!releaseHasSourceMapArtifacts(files)) {
  throw new Error(
    `Sentry release ${config.release} has no uploaded source map artifacts for project ${config.project}.`,
  );
}

console.log(
  `Verified Sentry release ${config.release} has ${files.filter(isSourceMapArtifact).length} source map artifact(s).`,
);

export function listReleaseFiles(config) {
  const command = process.platform === "win32" ? "sentry-cli.cmd" : "sentry-cli";
  const result = spawnSync(
    command,
    ["releases", "files", config.release, "list", "--org", config.org, "--project", config.project],
    { encoding: "utf8" },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sentry-cli releases files list failed with exit code ${result.status}.`);
  }

  return parseReleaseFilesList(result.stdout);
}

export function parseReleaseFilesList(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function isSourceMapArtifact(fileName) {
  return fileName.endsWith(".map") || fileName.includes(".map~") || fileName.includes("sourcemap");
}

export function releaseHasSourceMapArtifacts(files) {
  return files.some(isSourceMapArtifact);
}
