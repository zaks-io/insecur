import type { CloudflareOptions } from "@sentry/cloudflare";

export interface SentryBindings {
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENABLE_LOGS?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_TRACES_SAMPLE_RATE?: string;
}

export interface SentryBrowserConfig {
  dsn: string;
  enableLogs?: boolean;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
}

export function sentryOptions(env: SentryBindings): CloudflareOptions {
  const browser = sentryBrowserConfig(env);
  const options: CloudflareOptions = {
    enabled: browser !== undefined,
    dataCollection: noDefaultDataCollection(),
    enableLogs: browser?.enableLogs === true,
    enableRpcTracePropagation: true,
  };

  if (!browser) {
    return options;
  }

  options.dsn = browser.dsn;
  copyOptionalOption(options, "environment", browser.environment);
  copyOptionalOption(options, "release", browser.release);
  copyOptionalOption(options, "tracesSampleRate", browser.tracesSampleRate);
  return options;
}

export function sentryBrowserConfig(env: SentryBindings): SentryBrowserConfig | undefined {
  const dsn = textBinding(env.SENTRY_DSN);
  if (dsn === undefined) {
    return undefined;
  }

  const config: SentryBrowserConfig = { dsn };
  copyOptionalOption(config, "environment", textBinding(env.SENTRY_ENVIRONMENT));
  copyOptionalOption(config, "release", textBinding(env.SENTRY_RELEASE));
  copyOptionalOption(config, "tracesSampleRate", sampleRate(env.SENTRY_TRACES_SAMPLE_RATE));
  if (env.SENTRY_ENABLE_LOGS === "true") {
    config.enableLogs = true;
  }
  return config;
}

export function sentryBrowserConfigScript(
  config: SentryBrowserConfig | undefined,
): string | undefined {
  if (config === undefined) {
    return undefined;
  }

  const json = JSON.stringify(config).replaceAll("<", "\\u003c");
  return `globalThis.__INSECUR_SENTRY=${json};`;
}

function textBinding(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === "") {
    return undefined;
  }
  return trimmed;
}

function sampleRate(value: string | undefined): number | undefined {
  const text = textBinding(value);
  if (text === undefined) {
    return undefined;
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return undefined;
  }
  return parsed;
}

function noDefaultDataCollection(): NonNullable<CloudflareOptions["dataCollection"]> {
  return {
    userInfo: false,
    httpBodies: [],
  };
}

function copyOptionalOption<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
