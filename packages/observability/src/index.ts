import type { CloudflareOptions } from "@sentry/cloudflare";

export interface SentryBindings {
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENABLE_LOGS?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_TRACES_SAMPLE_RATE?: string;
}

export interface SentryBrowserConfig {
  readonly dsn: string;
  readonly enableLogs?: boolean;
  readonly environment?: string;
  readonly release?: string;
  readonly tracesSampleRate?: number;
}

export function cloudflareSentryOptions(env: SentryBindings): CloudflareOptions {
  const dsn = optional(env.SENTRY_DSN);
  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const tracesSampleRate = parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE);

  return {
    enabled: Boolean(dsn),
    ...(dsn ? { dsn } : {}),
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(tracesSampleRate === undefined ? {} : { tracesSampleRate }),
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    enableLogs: env.SENTRY_ENABLE_LOGS === "true",
    enableRpcTracePropagation: true,
  };
}

export function sentryBrowserConfig(env: SentryBindings): SentryBrowserConfig | undefined {
  const dsn = optional(env.SENTRY_DSN);
  if (!dsn) {
    return undefined;
  }

  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const tracesSampleRate = parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE);

  return {
    dsn,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(tracesSampleRate === undefined ? {} : { tracesSampleRate }),
    ...(env.SENTRY_ENABLE_LOGS === "true" ? { enableLogs: true } : {}),
  };
}

export function sentryBrowserConfigScript(
  config: SentryBrowserConfig | undefined,
): string | undefined {
  if (!config) {
    return undefined;
  }

  return `globalThis.__INSECUR_SENTRY=${JSON.stringify(config).replaceAll("<", "\\u003c")};`;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function parseSampleRate(value: string | undefined): number | undefined {
  const raw = optional(value);
  if (!raw) {
    return undefined;
  }

  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : undefined;
}
