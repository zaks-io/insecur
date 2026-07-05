import { spawnSync } from "node:child_process";

export const SENTRY_CLI_TIMEOUT_MS = 300_000;

export function buildSentryCliEnv(config, baseEnv = process.env) {
  const childEnv = {
    PATH: baseEnv.PATH,
    HOME: baseEnv.HOME,
    USER: baseEnv.USER,
    LANG: baseEnv.LANG,
    SENTRY_AUTH_TOKEN: config.authToken,
  };

  const sentryUrl = optional(baseEnv.SENTRY_URL);
  if (sentryUrl) {
    childEnv.SENTRY_URL = sentryUrl;
  }

  return childEnv;
}

export function runSentryCli(args, config, options = {}) {
  const command = process.platform === "win32" ? "sentry-cli.cmd" : "sentry-cli";
  const timeout = options.timeout ?? SENTRY_CLI_TIMEOUT_MS;
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? "inherit",
    encoding: options.encoding,
    env: buildSentryCliEnv(config, options.env ?? process.env),
    timeout,
  });

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`sentry-cli ${args[0]} timed out after ${timeout}ms.`);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`sentry-cli ${args[0]} failed with exit code ${result.status}.`);
  }

  return result;
}

function optional(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
