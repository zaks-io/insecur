import type { CloudflareOptions } from "@sentry/cloudflare";
import {
  prepareSentryEvent,
  prepareSentrySpan,
  prepareSentryTransaction,
  type SentryEventLike,
  type SentrySanitizationMetadata,
  type SentrySpanLike,
  type SentryTransactionLike,
} from "./sentry-sanitization.js";

export {
  requestWithoutSentryBaggage,
  sentryFetchWithBaggageGuard,
} from "./sentry-request-handler.js";

export interface SentryBindings {
  readonly SENTRY_DSN?: string;
  readonly SENTRY_ENABLE_LOGS?: string;
  readonly SENTRY_ENVIRONMENT?: string;
  readonly SENTRY_RELEASE?: string;
  readonly SENTRY_SERVICE?: string;
}

export interface SentryBrowserConfig {
  readonly dsn: string;
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
  readonly dataCollection: MetadataOnlySentryDataCollection;
  readonly enableLogs: boolean;
  readonly integrations: TIntegration[];
  readonly beforeSend: <TEvent extends SentryEventLike>(event: TEvent) => TEvent;
  readonly beforeSendSpan: <TSpan extends SentrySpanLike>(span: TSpan) => TSpan;
  readonly beforeSendTransaction: <TEvent extends SentryTransactionLike>(event: TEvent) => TEvent;
}

export const DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 1;

let browserSentryInitialized = false;

interface MetadataOnlySentryDataCollection {
  readonly cookies: false;
  readonly frameContextLines: 0;
  readonly genAI: { readonly inputs: false; readonly outputs: false };
  readonly httpBodies: never[];
  readonly httpHeaders: { readonly request: false; readonly response: false };
  readonly queryParams: false;
  readonly stackFrameVariables: false;
  readonly userInfo: false;
}

const METADATA_ONLY_DATA_COLLECTION: MetadataOnlySentryDataCollection = {
  cookies: false,
  frameContextLines: 0,
  genAI: { inputs: false, outputs: false },
  httpBodies: [],
  httpHeaders: { request: false, response: false },
  queryParams: false,
  stackFrameVariables: false,
  userInfo: false,
};

export function cloudflareSentryOptions(env: SentryBindings): CloudflareOptions {
  const dsn = optional(env.SENTRY_DSN);
  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const service = optional(env.SENTRY_SERVICE);
  const sanitizationMetadata = sentrySanitizationMetadata({
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(service ? { service } : {}),
  });
  return {
    enabled: Boolean(dsn),
    ...(dsn ? { dsn } : {}),
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
    dataCollection: METADATA_ONLY_DATA_COLLECTION,
    enableLogs: false,
    enableRpcTracePropagation: true,
    // Continue inbound traces only when the caller's baggage carries our Sentry org id (extracted
    // from the DSN); arbitrary third-party sentry-trace/baggage on the public edge starts a new
    // trace instead of joining ours.
    strictTraceContinuation: true,
    beforeSend(event) {
      return prepareSentryEvent(event, sanitizationMetadata);
    },
    beforeSendSpan(span) {
      return prepareSentrySpan(span);
    },
    beforeSendTransaction(event) {
      return prepareSentryTransaction(event, sanitizationMetadata);
    },
    beforeSendLog() {
      return null;
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

  return {
    dsn,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(service ? { service } : {}),
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
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
  const sanitizationMetadata = sentrySanitizationMetadata(config);
  return {
    dsn: config.dsn,
    enabled: true,
    ...(config.environment ? { environment: config.environment } : {}),
    ...(config.release ? { release: config.release } : {}),
    tracesSampleRate: config.tracesSampleRate,
    dataCollection: METADATA_ONLY_DATA_COLLECTION,
    enableLogs: false,
    integrations: [routerTracingIntegration(router)],
    beforeSend(event) {
      return prepareSentryEvent(event, sanitizationMetadata);
    },
    beforeSendSpan(span) {
      return prepareSentrySpan(span);
    },
    beforeSendTransaction(event) {
      return prepareSentryTransaction(event, sanitizationMetadata);
    },
  };
}

function sentrySanitizationMetadata(
  config: Pick<SentryBrowserConfig, "environment" | "release" | "service">,
): SentrySanitizationMetadata {
  return {
    ...(config.environment ? { environment: config.environment } : {}),
    platform: "javascript",
    ...(config.release ? { release: config.release } : {}),
    ...(config.service ? { service: config.service } : {}),
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
