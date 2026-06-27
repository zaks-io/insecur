#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnvAssignments } from "../packages/tenant-store/scripts/lib/env-local.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const apiConfig = "apps/api/wrangler.jsonc";
const runtimeConfig = "apps/runtime/wrangler.jsonc";
const previewApiName = "insecur-api-preview";
const previewRuntimeName = "insecur-runtime-preview";

const options = parseArgs(process.argv.slice(2));
loadOptionalEnvFile(".env.preview");

const config = readConfig();
assertPreviewConfig(config);

if (options.check) {
  process.stdout.write("OK preview deploy configuration is internally consistent\n");
  process.exit(0);
}

await main(config);

async function main(config) {
  migrateAndSeed(config);
  deployWorker(runtimeConfig);
  syncSecrets(runtimeConfig, ["RUNTIME_TOKEN_SIGNING_SECRET"], config);
  deployWorker(apiConfig, [
    ["INSTANCE_ID", config.instanceId],
    ["WORKOS_CLIENT_ID", config.workosClientId],
  ]);
  syncSecrets(
    apiConfig,
    [
      "SESSION_SIGNING_SECRET",
      "RUNTIME_TOKEN_SIGNING_SECRET",
      "WORKOS_API_KEY",
      "WORKOS_COOKIE_PASSWORD",
    ],
    config,
  );

  emitOutput("base_url", config.baseUrl);
  process.stdout.write(`Preview API deployed: ${config.baseUrl}\n`);

  if (!options.skipSmoke) {
    await waitForHealthz(config.baseUrl);
    runSmoke(config);
  }
}

function migrateAndSeed(config) {
  const env = {
    ...process.env,
    DATABASE_URL_MIGRATION: config.previewDatabaseUrl,
    INSTANCE_ID: config.instanceId,
    SMOKE_WORKOS_USER_ID: config.smokeWorkosUserId,
    SMOKE_ADMITTED_USER_ID: config.smokeAdmittedUserId,
  };
  run("pnpm", ["--filter", "@insecur/tenant-store", "migrate:local"], env);
  run(
    "pnpm",
    [
      "--filter",
      "@insecur/tenant-store",
      "exec",
      "node",
      "scripts/seed-preview-smoke-admission.mjs",
    ],
    env,
  );
}

function deployWorker(configPath, vars = []) {
  const args = ["exec", "wrangler", "deploy", "--config", configPath, "--env", "preview"];
  for (const [key, value] of vars) {
    args.push("--var", `${key}:${value}`);
  }
  run("pnpm", args, process.env);
}

function syncSecrets(configPath, keys, config) {
  for (const key of keys) {
    const value = config.secrets.get(key);
    if (!value) {
      throw new Error(`${key} is required`);
    }
    run(
      "pnpm",
      ["exec", "wrangler", "secret", "put", key, "--config", configPath, "--env", "preview"],
      process.env,
      `${value}\n`,
    );
  }
}

function runSmoke(config) {
  run(
    "pnpm",
    ["--filter", "@insecur/api", "exec", "node", join(root, "scripts/ci/smoke-first-value.mjs")],
    {
      ...process.env,
      SMOKE_BASE_URL: config.baseUrl,
      SMOKE_SESSION_SIGNING_SECRET: config.smokeSessionSigningSecret,
      SMOKE_WORKOS_USER_ID: config.smokeWorkosUserId,
      SMOKE_ADMITTED_USER_ID: config.smokeAdmittedUserId,
    },
  );
}

async function waitForHealthz(baseUrl) {
  const attempts = 45;
  let consecutive = 0;
  for (let i = 1; i <= attempts; i += 1) {
    const status = await fetchStatus(`${baseUrl}/healthz`);
    if (status === 200) {
      consecutive += 1;
      process.stdout.write(`${baseUrl}/healthz healthy (${consecutive}/3) on attempt ${i}\n`);
      if (consecutive >= 3) {
        return;
      }
    } else {
      consecutive = 0;
      process.stdout.write(`not ready (status=${status}) on attempt ${i}, retrying...\n`);
    }
    await sleep(2000);
  }
  throw new Error(`${baseUrl}/healthz never got 3 consecutive healthy responses`);
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch {
    return 0;
  }
}

function readConfig() {
  const previewDatabaseUrl = requireEnv("PREVIEW_DATABASE_URL_MIGRATION");
  assertLiveNeonUrl(previewDatabaseUrl);
  const subdomain = requireEnv("CLOUDFLARE_WORKERS_SUBDOMAIN");
  const sessionSigningSecret = requireEnv("SESSION_SIGNING_SECRET");
  return {
    baseUrl: process.env.SMOKE_BASE_URL ?? `https://${previewApiName}.${subdomain}.workers.dev`,
    hyperdriveId: requireEnv("PREVIEW_HYPERDRIVE_ID"),
    instanceId: process.env.PREVIEW_INSTANCE_ID ?? "inst_PREVIEW",
    previewDatabaseUrl,
    smokeAdmittedUserId: requireEnv("SMOKE_ADMITTED_USER_ID"),
    smokeSessionSigningSecret: process.env.SMOKE_SESSION_SIGNING_SECRET ?? sessionSigningSecret,
    smokeWorkosUserId: requireEnv("SMOKE_WORKOS_USER_ID"),
    workosClientId: requireEnv("WORKOS_CLIENT_ID"),
    secrets: new Map([
      ["RUNTIME_TOKEN_SIGNING_SECRET", requireEnv("RUNTIME_TOKEN_SIGNING_SECRET")],
      ["SESSION_SIGNING_SECRET", sessionSigningSecret],
      ["WORKOS_API_KEY", requireEnv("WORKOS_API_KEY")],
      ["WORKOS_COOKIE_PASSWORD", requireEnv("WORKOS_COOKIE_PASSWORD")],
    ]),
  };
}

function assertPreviewConfig(config) {
  assertFileContains(apiConfig, `"name": "${previewApiName}"`);
  assertFileContains(apiConfig, `"service": "${previewRuntimeName}"`);
  assertFileContains(runtimeConfig, `"name": "${previewRuntimeName}"`);
  assertFileContains(runtimeConfig, `"id": "${config.hyperdriveId}"`);
  if (config.hyperdriveId === "0000000000000000000000000000000a") {
    throw new Error("PREVIEW_HYPERDRIVE_ID still points at the placeholder id");
  }
}

function assertFileContains(path, expected) {
  const source = readFileSync(join(root, path), "utf8");
  if (!source.includes(expected)) {
    throw new Error(`${path} is missing ${expected}`);
  }
}

function assertLiveNeonUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PREVIEW_DATABASE_URL_MIGRATION must be a valid Postgres URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("PREVIEW_DATABASE_URL_MIGRATION must use postgres:// or postgresql://");
  }
  if (!parsed.hostname.endsWith(".neon.tech")) {
    throw new Error("PREVIEW_DATABASE_URL_MIGRATION must target the live Neon preview database");
  }
}

function loadOptionalEnvFile(fileName) {
  const path = join(root, fileName);
  if (!existsSync(path)) {
    return;
  }
  const assignments = parseEnvAssignments(readFileSync(path, "utf8"));
  for (const { key, value } of assignments) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required for preview deploy`);
  }
  return value;
}

function run(command, args, env, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function emitOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  return {
    check: argv.includes("--check"),
    skipSmoke: argv.includes("--skip-smoke"),
  };
}
