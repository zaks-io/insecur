#!/usr/bin/env node
/**
 * Runs DB-backed CI layers after the caller prepares and migrates Postgres:
 * load .env.local, assert RLS guardrails, then every workspace test:rls suite
 * plus e2e, CLI integration, and canary with INSECUR_CI_RLS_GATE=1.
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
  // The caller already applied migrations; per-suite seed must not re-run migrate.mjs
  // concurrently across turbo tasks (deadlock under parallel test:rls).
  INSECUR_TEST_SKIP_MIGRATE: "1",
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
// Probe turbo strict env forwarding before DB-backed suites run.
run("pnpm", ["exec", "turbo", "run", "assert:ci-rls-gate-env", "--filter=@insecur/tenant-store"]);
console.log(
  "OK postgres-integration: INSECUR_CI_RLS_GATE will be forwarded to all workspace test:rls suites, test:e2e, CLI integration, and test:canary; INSECUR_TEST_SKIP_MIGRATE=1 (caller prepared the shared database)",
);
run("pnpm", ["exec", "turbo", "run", "test:rls"]);
run("pnpm", ["exec", "turbo", "run", "test:e2e"]);
run("pnpm", ["--filter", "@insecur/cli", "test:integration"]);
run("pnpm", ["exec", "turbo", "run", "test:canary"]);
