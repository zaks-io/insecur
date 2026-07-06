#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import {
  countReleaseArtifactBundleFiles,
  releaseHasArtifactBundleSourcemaps,
  waitForReleaseArtifactBundles,
} from "./sentry-artifact-bundles.mjs";
import { runCliMain } from "./cli-exit.mjs";
import { resolveSentrySourcemapConfig } from "./sentry-sourcemap-config.mjs";

export async function verifyReleaseSourcemaps(env = process.env, options = {}) {
  const config = resolveSentrySourcemapConfig(env);

  if (config.action === "skip") {
    console.log("SENTRY_AUTH_TOKEN is not set; skipping Sentry source map verification.");
    return { action: "skip", reason: "missing_auth_token" };
  }

  const bundles = await waitForReleaseArtifactBundles(config, env, options);
  if (!releaseHasArtifactBundleSourcemaps(bundles, config.release)) {
    throw new Error(
      `Sentry release ${config.release} has no uploaded artifact bundle source maps for project ${config.project}.`,
    );
  }

  const fileCount = countReleaseArtifactBundleFiles(bundles, config.release);
  console.log(
    `Verified Sentry release ${config.release} has ${fileCount} artifact bundle file(s) across uploaded source map bundle(s).`,
  );
  return { action: "verify", release: config.release, fileCount };
}

async function main() {
  await verifyReleaseSourcemaps();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCliMain(main);
}
