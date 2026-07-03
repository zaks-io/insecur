import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseJsonc } from "./jsonc.mjs";

const PRODUCTION_ENV = "";

const API_RATELIMIT_ENV = {
  ONBOARDING_IP: "INSECUR_API_RATELIMIT_ONBOARDING_IP_NAMESPACE_ID",
  ONBOARDING_ACTOR: "INSECUR_API_RATELIMIT_ONBOARDING_ACTOR_NAMESPACE_ID",
  BOOTSTRAP_IP: "INSECUR_API_RATELIMIT_BOOTSTRAP_IP_NAMESPACE_ID",
  BOOTSTRAP_ACTOR: "INSECUR_API_RATELIMIT_BOOTSTRAP_ACTOR_NAMESPACE_ID",
  AUTH_EXCHANGE_IP: "INSECUR_API_RATELIMIT_AUTH_EXCHANGE_IP_NAMESPACE_ID",
};

export async function loadDeployWranglerConfig(sourcePath, options = {}) {
  const source = await readFile(sourcePath, "utf8");
  const parsed = parseJsonc(source, sourcePath);
  const config = materializeDeployWranglerConfig(parsed, { ...options, sourcePath });
  return { config, sourceDir: path.dirname(sourcePath) };
}

export function materializeDeployWranglerConfig(config, options = {}) {
  const next = structuredClone(config);
  const env = options.env ?? process.env;
  const wranglerEnv = normalizeWranglerEnv(options.wranglerEnv ?? env.CLOUDFLARE_ENV);
  const scope = selectWranglerScope(next, wranglerEnv);
  const deployContext = {
    env,
    sourcePath: options.sourcePath,
    workerName: next.name,
    wranglerEnv,
  };

  switch (next.name) {
    case "insecur-api":
      materializeApiConfig(scope, deployContext);
      break;
    case "insecur-runtime":
      materializeRuntimeConfig(scope, deployContext);
      break;
    case "insecur-web":
      materializeWebConfig(scope, deployContext);
      break;
    default:
      break;
  }

  return next;
}

export function getWranglerEnvName(args, env = process.env) {
  const cliEnv = readWranglerEnvArg(args);
  return normalizeWranglerEnv(cliEnv ?? env.CLOUDFLARE_ENV ?? PRODUCTION_ENV);
}

export function parseConfigCommandArgs(argv) {
  const delimiterIndex = argv.indexOf("--");
  const configArg = delimiterIndex === -1 ? argv[0] : argv.slice(0, delimiterIndex)[0];
  const commandArgs = delimiterIndex === -1 ? argv.slice(1) : argv.slice(delimiterIndex + 1);
  return { configArg, commandArgs };
}

export function rebaseConfigPaths(config, fromDir, toDir) {
  const rebased = structuredClone(config);
  rebased.main = rebasePath(rebased.main, fromDir, toDir);
  if (rebased.assets && typeof rebased.assets === "object") {
    rebased.assets.directory = rebasePath(rebased.assets.directory, fromDir, toDir);
  }
  return rebased;
}

export async function withTempWranglerConfig(prefix, config, sourceDir, callback) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const tempConfigPath = path.join(tempDir, "wrangler.json");

  try {
    await writeFile(
      tempConfigPath,
      `${JSON.stringify(rebaseConfigPaths(config, sourceDir, tempDir), null, 2)}\n`,
    );
    return await callback(tempConfigPath);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function runWrangler(args, label = "wrangler") {
  const command = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
  const child = spawn(command, args, { stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}.`);
  }
}

function materializeApiConfig(scope, context) {
  scope.vars ??= {};
  scope.vars.INSTANCE_ID = requireDeployEnv("INSECUR_INSTANCE_ID", context);
  scope.vars.WORKOS_CLIENT_ID = requireDeployEnv("INSECUR_WORKOS_CLIENT_ID", context);

  if (!Array.isArray(scope.ratelimits)) {
    throw new Error(`Expected ${scopeLabel(context)} ratelimits to be an array.`);
  }

  const seen = new Set();
  for (const binding of scope.ratelimits) {
    const envName = API_RATELIMIT_ENV[binding?.name];
    if (!envName) {
      continue;
    }
    binding.namespace_id = requireDeployEnv(envName, context);
    seen.add(binding.name);
  }

  for (const bindingName of Object.keys(API_RATELIMIT_ENV)) {
    if (!seen.has(bindingName)) {
      throw new Error(`Expected ${scopeLabel(context)} ratelimits to include ${bindingName}.`);
    }
  }
}

function materializeRuntimeConfig(scope, context) {
  const rootKey = only(scope.secrets_store_secrets, "secrets_store_secrets", context);
  rootKey.store_id = requireDeployEnv("INSECUR_RUNTIME_ROOT_KEY_STORE_ID", context);
  rootKey.secret_name = requireDeployEnv("INSECUR_RUNTIME_ROOT_KEY_SECRET_NAME", context);

  const hyperdrive = only(scope.hyperdrive, "hyperdrive", context);
  hyperdrive.id = requireDeployEnv("INSECUR_RUNTIME_HYPERDRIVE_ID", context);
}

function materializeWebConfig(scope, context) {
  scope.vars ??= {};
  scope.vars.INSTANCE_ID = requireDeployEnv("INSECUR_INSTANCE_ID", context);
  scope.vars.WORKOS_CLIENT_ID = requireDeployEnv("INSECUR_WORKOS_CLIENT_ID", context);
}

function selectWranglerScope(config, wranglerEnv) {
  if (!wranglerEnv) {
    return config;
  }
  const scope = config.env?.[wranglerEnv];
  if (!scope) {
    throw new Error(`Wrangler config has no env.${wranglerEnv} scope.`);
  }
  return scope;
}

function readWranglerEnvArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--env" || arg === "-e") {
      return args[index + 1] ?? PRODUCTION_ENV;
    }
    if (arg.startsWith("--env=")) {
      return arg.slice("--env=".length);
    }
  }
  return undefined;
}

function normalizeWranglerEnv(value) {
  if (!value || value === '""' || value === "production") {
    return undefined;
  }
  return value;
}

function requireDeployEnv(name, context) {
  const value = context.env[name];
  if (!value) {
    throw new Error(
      `${name} is required for ${scopeLabel(context)}. Configure it in the GitHub Environment or export it for local deploys.`,
    );
  }
  return value;
}

function scopeLabel(context) {
  const target = context.wranglerEnv ? `env.${context.wranglerEnv}` : "production";
  return `${context.workerName} ${target} deploy config`;
}

function only(values, label, context) {
  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error(`Expected exactly one ${label} entry in ${scopeLabel(context)}.`);
  }
  return values[0];
}

function rebasePath(value, fromDir, toDir) {
  if (typeof value !== "string" || path.isAbsolute(value)) {
    return value;
  }
  const relativePath = path.relative(toDir, path.resolve(fromDir, value));
  return relativePath || ".";
}
