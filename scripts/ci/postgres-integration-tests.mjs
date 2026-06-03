#!/usr/bin/env node
/**
 * Runs DB-backed CI layers after pnpm dev:db:reset: load .env.local, assert RLS
 * guardrails, then turbo test:rls + test:e2e with INSECUR_CI_RLS_GATE=1.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnvLocal } from "../../packages/tenant-store/scripts/lib/env-local.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

loadRepoEnvLocal();

const env = {
  ...process.env,
  INSECUR_CI_RLS_GATE: "1",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("pnpm", ["--filter", "@insecur/tenant-store", "assert:rls-credentials"]);
run("pnpm", ["exec", "turbo", "run", "test:rls", "test:e2e"]);
