#!/usr/bin/env node
// Wrangler Env type conformance gate (INS-511). Fails when generated worker-configuration.d.ts
// files are stale relative to apps/*/wrangler.jsonc.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const script = join(repoRoot, "scripts", "wrangler-types.mjs");

const result = spawnSync(process.execPath, [script, "--check"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("wrangler-types conformance: all Worker Env declarations match wrangler.jsonc");
