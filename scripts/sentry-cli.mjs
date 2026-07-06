import { spawnSync } from "node:child_process";
import { accessSync } from "node:fs";
import { createRequire } from "node:module";
import { constants as fsConstants } from "node:fs";

export const SENTRY_CLI_TIMEOUT_MS = 300_000;

const PRESERVED_RUNTIME_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "REQUESTS_CA_BUNDLE",
  "CURL_CA_BUNDLE",
  "SYSTEMROOT",
  "SystemRoot",
  "COMSPEC",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "TEMP",
  "TMP",
];

export function buildSentryCliEnv(config, baseEnv = process.env) {
  const childEnv = {};

  for (const key of PRESERVED_RUNTIME_ENV_KEYS) {
    const value = baseEnv[key];
    if (value !== undefined) {
      childEnv[key] = value;
    }
  }

  childEnv.SENTRY_AUTH_TOKEN = config.authToken;

  const sentryUrl = optional(baseEnv.SENTRY_URL);
  if (sentryUrl) {
    childEnv.SENTRY_URL = sentryUrl;
  }

  return childEnv;
}

export function resolveSentryCliInvocation(options = {}) {
  const execPath = options.execPath ?? process.execPath;
  const scriptPath = resolveSentryCliScriptPath(options);
  assertSentryCliScriptExists(scriptPath);

  return {
    command: execPath,
    argsPrefix: [scriptPath],
  };
}

export function runSentryCli(args, config, options = {}) {
  const { command, argsPrefix } = options.invocation ?? resolveSentryCliInvocation(options);
  const timeout = options.timeout ?? SENTRY_CLI_TIMEOUT_MS;
  const result = spawnSync(command, [...argsPrefix, ...args], {
    stdio: resolveSentryCliStdio(options),
    encoding: options.encoding,
    env: buildSentryCliEnv(config, options.env ?? process.env),
    timeout,
  });

  assertSentryCliSucceeded(result, args, timeout);
  return result;
}

function resolveSentryCliScriptPath(options = {}) {
  const resolveFrom = options.resolveFrom ?? import.meta.url;
  const requireFrom = options.require ?? createRequire(resolveFrom);

  try {
    return requireFrom.resolve("@sentry/cli/bin/sentry-cli");
  } catch (error) {
    if (error?.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "sentry-cli is not installed. Run pnpm install so the @sentry/cli devDependency is available.",
        { cause: error },
      );
    }
    throw error;
  }
}

function assertSentryCliScriptExists(scriptPath) {
  try {
    accessSync(scriptPath, fsConstants.F_OK);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "sentry-cli is not installed. Run pnpm install so the @sentry/cli devDependency is available.",
        { cause: error },
      );
    }
    throw error;
  }
}

function resolveSentryCliStdio(options) {
  if (options.stdio !== undefined) {
    return options.stdio;
  }
  if (options.encoding) {
    return ["inherit", "pipe", "inherit"];
  }
  return "inherit";
}

function assertSentryCliSucceeded(result, args, timeout) {
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`sentry-cli ${args[0]} timed out after ${timeout}ms.`);
    }
    if (result.error.code === "ENOENT") {
      throw new Error(
        "sentry-cli could not be executed. Run pnpm install so the @sentry/cli devDependency is available.",
        { cause: result.error },
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sentry-cli ${args[0]} failed with exit code ${result.status}.`);
  }
}

function optional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
