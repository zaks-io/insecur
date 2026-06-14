#!/usr/bin/env node
// Create or update a Cloudflare Hyperdrive config that pools a per-PR Neon branch.
// Pass the app_role (runtime) connection string — never a migration/owner URL.
// Each PR gets one Hyperdrive (only the Runtime Worker binds it); name-matched
// lookup (lib/hyperdrive.mjs) keeps create/refresh from ever touching a shared config.
import { appendFileSync } from "node:fs";

import { findHyperdriveByName, run, stringOption } from "./lib/hyperdrive.mjs";

const options = parseArgs(process.argv.slice(2));
const connectionString = process.env[options.connectionStringEnv];
if (!connectionString) {
  throw new Error(`Set ${options.connectionStringEnv}.`);
}

const existing = await findHyperdriveByName(options.name);
const id = existing
  ? await refreshHyperdrive(existing.id, connectionString)
  : await createHyperdrive(options.name, connectionString);
emitOutput(options.githubOutput, id);
process.stdout.write(`Hyperdrive ${options.name}: ${id}\n`);

async function createHyperdrive(name, connectionString) {
  const result = await run("pnpm", [
    "exec",
    "wrangler",
    "hyperdrive",
    "create",
    name,
    "--connection-string",
    connectionString,
  ]);
  const match = result.stdout.match(/Created new Hyperdrive PostgreSQL config:\s*([0-9a-f-]+)/i);
  if (!match) {
    throw new Error(
      `Could not parse Hyperdrive id from wrangler output:\n${result.stdout || result.stderr}`,
    );
  }
  return match[1];
}

async function refreshHyperdrive(id, connectionString) {
  await run("pnpm", [
    "exec",
    "wrangler",
    "hyperdrive",
    "update",
    id,
    "--connection-string",
    connectionString,
  ]);
  return id;
}

function emitOutput(name, value) {
  if (!name) {
    return;
  }
  process.stdout.write(`${name}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function parseArgs(argv) {
  const name = stringOption(argv, "--name");
  const connectionStringEnv = stringOption(argv, "--connection-string-env") ?? "DATABASE_URL";
  const githubOutput = stringOption(argv, "--github-output");
  if (!name) {
    throw new Error("Set --name.");
  }
  return { name, connectionStringEnv, githubOutput };
}
