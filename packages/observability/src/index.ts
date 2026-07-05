import type { CloudflareOptions } from "@sentry/cloudflare";

export interface SentryBindings {
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENABLE_LOGS?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_SERVICE?: string;
  readonly SENTRY_TRACES_SAMPLE_RATE?: string;
}

export interface SentryBrowserConfig {
  readonly dsn: string;
  readonly enableLogs?: boolean;
  readonly environment?: string;
  readonly release?: string;
  readonly service?: string;
  readonly tracesSampleRate?: number;
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
  readonly tracesSampleRate?: number;
  readonly dataCollection: {
    readonly userInfo: false;
    readonly httpBodies: [];
  };
  readonly enableLogs: boolean;
  readonly integrations: TIntegration[];
  readonly beforeSend: <TEvent extends SentryEventLike>(event: TEvent) => TEvent;
}

interface SentryEventLike {
  message?: string;
  exception?: {
    values?: SentryExceptionLike[];
  };
  request?: unknown;
  breadcrumbs?: unknown[];
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}

interface SentryExceptionLike {
  value?: string;
}

const REDACTED_SENTRY_MESSAGE = "[redacted by insecur]";

let browserSentryInitialized = false;

export function cloudflareSentryOptions(env: SentryBindings): CloudflareOptions {
  const dsn = optional(env.SENTRY_DSN);
  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const service = optional(env.SENTRY_SERVICE);
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
    beforeSend(event) {
      return prepareSentryEvent(event, service);
    },
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
  const tracesSampleRate = parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE);

  return {
    dsn,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(service ? { service } : {}),
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
    ...(config.tracesSampleRate === undefined ? {} : { tracesSampleRate: config.tracesSampleRate }),
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    enableLogs: config.enableLogs === true,
    integrations: config.tracesSampleRate === undefined ? [] : [routerTracingIntegration(router)],
    beforeSend(event) {
      return prepareSentryEvent(event, config.service);
    },
  };
}

function prepareSentryEvent<TEvent extends SentryEventLike>(
  event: TEvent,
  service: string | undefined,
): TEvent {
  event.message = REDACTED_SENTRY_MESSAGE;
  for (const value of event.exception?.values ?? []) {
    value.value = REDACTED_SENTRY_MESSAGE;
  }
  delete event.request;
  event.breadcrumbs = [];
  event.extra = {};
  if (service) {
    event.tags = { service };
  } else {
    delete event.tags;
  }
  return event;
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

declare global {
  interface Window {
    __INSECUR_SENTRY?: SentryBrowserConfig;
  }
}
