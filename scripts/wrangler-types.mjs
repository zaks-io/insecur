#!/usr/bin/env node
// Generate or check Wrangler Env declarations for the Worker fleet (INS-511).
// Bindings and public vars come from each app's wrangler.jsonc; secrets and RPC contracts stay
// explicit in apps/*/src/env.ts.

import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

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
function wranglerTypesArgs(cwd, mode) {
  return [
    "types",
    OUTPUT,
    "--config",
    "wrangler.jsonc",
    // An explicit empty env file excludes developer .dev.vars and .env keys from shared types.
    "--env-file",
    relative(cwd, join(repoRoot, "scripts", "wrangler-types.env")),
    "--env-interface",
    "CloudflareEnv",
    "--include-runtime",
    "false",
    "--strict-vars",
    "false",
    ...(mode === "check" ? ["--check"] : []),
  ];
}

export function runWranglerTypes(cwd, mode) {
  return spawnSync("pnpm", ["exec", "wrangler", ...wranglerTypesArgs(cwd, mode)], {
    cwd,
    env: { ...process.env, CLOUDFLARE_INCLUDE_PROCESS_ENV: "false" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runTarget({ app }, mode) {
  const result = runWranglerTypes(join(repoRoot, "apps", app), mode);

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    console.error(
      `\nwrangler types ${mode} failed for apps/${app}. Regenerate from the repo root with: pnpm wrangler:types`,
    );
    process.exit(result.status ?? 1);
  }
}

if (isMain) {
  const { values } = parseArgs({
    options: { app: { type: "string" }, check: { type: "boolean" } },
  });
  const targets =
    values.app === undefined
      ? WRANGLER_TYPE_TARGETS
      : WRANGLER_TYPE_TARGETS.filter((target) => target.app === values.app);
  if (targets.length === 0) {
    throw new Error(`Unknown Worker app: ${values.app}. Expected api, runtime, web, or site.`);
  }

  const mode = values.check ? "check" : "generate";
  for (const target of targets) {
    runTarget(target, mode);
  }

  if (mode === "generate") {
    console.log(
      `Wrangler Env types generated for ${targets.map((target) => target.app).join(", ")}.`,
    );
  }
}
