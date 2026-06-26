#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRepoEnvLocal,
  requireDatabaseUrl,
} from "../packages/tenant-store/scripts/lib/env-local.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

run("node", ["scripts/dev-db.mjs", "env"]);
loadRepoEnvLocal();

const env = { ...process.env };
if (!env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB) {
  env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB = requireDatabaseUrl("DATABASE_URL_RUNTIME");
}

run(
  "pnpm",
  ["exec", "turbo", "run", "dev", "--filter", "@insecur/api", "--filter", "@insecur/runtime"],
  env,
);

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
