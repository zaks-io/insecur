import type { CloudflareOptions } from "@sentry/cloudflare";

export interface SentryBindings {
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENABLE_LOGS?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_SERVICE?: string;
}

export interface SentryBrowserConfig {
  readonly dsn: string;
  readonly enableLogs?: boolean;
  readonly environment?: string;
  readonly release?: string;
  readonly service?: string;
  readonly tracesSampleRate: number;
}

export interface BrowserSentryRuntime<TRouter, TIntegration> {
  readonly init: (options: BrowserSentryOptions<TIntegration>) => void;
  readonly routerTracingIntegration: (router: TRouter) => TIntegration;
}

export interface BrowserSentryOptions<TIntegration> {
  readonly dsn: string;
  readonly enabled: true;
  readonly environment?: string;
  readonly release?: string;
  readonly tracesSampleRate: number;
  readonly sendDefaultPii: boolean;
  readonly enableLogs: boolean;
  readonly integrations: TIntegration[];
  readonly initialScope?: { readonly tags: Record<string, string> };
}

export const DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 1;

let browserSentryInitialized = false;

// Prelaunch telemetry posture: full-fidelity events (PII, payloads, breadcrumbs) so we can see
// what the SDK actually captures. Re-tightening before go-live is tracked in Linear.
export function cloudflareSentryOptions(env: SentryBindings): CloudflareOptions {
  const dsn = optional(env.SENTRY_DSN);
  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const service = optional(env.SENTRY_SERVICE);

  return {
    enabled: Boolean(dsn),
    ...(dsn ? { dsn } : {}),
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: true,
    enableLogs: env.SENTRY_ENABLE_LOGS === "true",
    enableRpcTracePropagation: true,
    ...(service ? { initialScope: { tags: { service } } } : {}),
  };
}

export function sentryBrowserConfig(env: SentryBindings): SentryBrowserConfig | undefined {
  const dsn = optional(env.SENTRY_DSN);
  if (!dsn) {
    return undefined;
  }

  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const service = optional(env.SENTRY_SERVICE);

  return {
    dsn,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(service ? { service } : {}),
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
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

export function initBrowserSentry<TRouter, TIntegration>(
  router: TRouter,
  runtime: BrowserSentryRuntime<TRouter, TIntegration>,
): void {
  const config = readBrowserSentryConfig();
  if (!config) {
    return;
  }

  runtime.init(browserSentryOptions(config, router, runtime.routerTracingIntegration));
  browserSentryInitialized = true;
}

function readBrowserSentryConfig(): SentryBrowserConfig | undefined {
  if (typeof window === "undefined" || browserSentryInitialized) {
    return undefined;
  }

  const config = window.__INSECUR_SENTRY;
  if (!config?.dsn) {
    return undefined;
  }
  return config;
}

function browserSentryOptions<TRouter, TIntegration>(
  config: SentryBrowserConfig,
  router: TRouter,
  routerTracingIntegration: (router: TRouter) => TIntegration,
): BrowserSentryOptions<TIntegration> {
  return {
    dsn: config.dsn,
    enabled: true,
    ...(config.environment ? { environment: config.environment } : {}),
    ...(config.release ? { release: config.release } : {}),
    tracesSampleRate: config.tracesSampleRate,
    sendDefaultPii: true,
    enableLogs: config.enableLogs === true,
    integrations: [routerTracingIntegration(router)],
    ...(config.service ? { initialScope: { tags: { service: config.service } } } : {}),
  };
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

declare global {
  interface Window {
    __INSECUR_SENTRY?: SentryBrowserConfig;
  }
}
