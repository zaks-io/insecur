#!/usr/bin/env node
// Generate or check Wrangler Env declarations for the Worker fleet (INS-511).
// Bindings and public vars come from each app's wrangler.jsonc; secrets and RPC contracts stay
// explicit in apps/*/src/env.ts.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

/** @type {ReadonlyArray<{ readonly app: string; readonly packageName: string }>} */
export const WRANGLER_TYPE_TARGETS = [
  { app: "api", packageName: "@insecur/api" },
  { app: "runtime", packageName: "@insecur/runtime" },
  { app: "web", packageName: "@insecur/web" },
  { app: "site", packageName: "@insecur/site" },
];

const OUTPUT = "src/worker-configuration.d.ts";
const mode = process.argv.includes("--check") ? "check" : "generate";

function wranglerTypesArgs() {
  return [
    "types",
    OUTPUT,
    "--config",
    "wrangler.jsonc",
    "--env-interface",
    "CloudflareEnv",
    "--include-runtime",
    "false",
    "--strict-vars",
    "false",
    ...(mode === "check" ? ["--check"] : []),
  ];
}

function runTarget({ app, packageName }) {
  const cwd = join(repoRoot, "apps", app);
  const result = spawnSync("pnpm", ["exec", "wrangler", ...wranglerTypesArgs()], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    const action =
      mode === "check"
        ? `pnpm wrangler:types:check (or pnpm --filter ${packageName} wrangler:types from apps/${app})`
        : `pnpm wrangler:types (or pnpm --filter ${packageName} wrangler:types from apps/${app})`;
    console.error(`\nwrangler types ${mode} failed for apps/${app}. Regenerate with: ${action}`);
    process.exit(result.status ?? 1);
  }
}

if (isMain) {
  for (const target of WRANGLER_TYPE_TARGETS) {
    runTarget(target);
  }

  if (mode === "generate") {
    console.log("Wrangler Env types generated for api, runtime, web, and site.");
  }
}
