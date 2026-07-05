#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

import { uploadWranglerSourcemaps } from "./sentry-upload-wrangler-sourcemaps.mjs";

export async function runPostDeploySentrySourcemaps(appLabel, mapDirArg, env = process.env) {
  const sourceMapDir = path.resolve(process.cwd(), mapDirArg);
  try {
    return await uploadWranglerSourcemaps(sourceMapDir, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${appLabel} post-deploy Sentry source map upload failed: ${message}`);
    throw error;
  }
}

async function main() {
  const appLabel = process.argv[2];
  const mapDir = process.argv[3] ?? "dist";
  if (!appLabel) {
    throw new Error(
      "Usage: node scripts/post-deploy-sentry-sourcemaps.mjs <worker-label> [source-map-dir]",
    );
  }
  await runPostDeploySentrySourcemaps(appLabel, mapDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.exit(1);
  });
}
