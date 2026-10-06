export { prepareSentryErrorDiagnostics } from "./sentry-error-diagnostics.js";
import type { CloudflareOptions } from "@sentry/cloudflare";
import { withStaticSpan } from "@sentry/core";
import {
  prepareSentryEvent,
  prepareSentrySpan,
  prepareSentryTransaction,
  type SentryEventLike,
  type SentrySanitizationMetadata,
  type SentryTransactionLike,
} from "./sentry-sanitization.js";

export {
  sanitizeSentryRequest,
  sentryFetchWithBaggageGuard,
  workerFetchWithTraceCorrelation,
} from "./sentry-request-handler.js";
export { prepareSentryTraceContext } from "./sentry-sanitization.js";
export { registerSentryRouteNames, sentryRouterTraceNames } from "./sentry-trace-names.js";
export { withWorkerTraceCorrelation } from "./worker-trace-correlation.js";

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
  readonly traceNames?: ReadonlySet<string>;
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
  readonly beforeSendLog: NonNullable<CloudflareOptions["beforeSendLog"]>;
  readonly maxBreadcrumbs: number;
  readonly integrations: TIntegration[];
  readonly beforeSend: <TEvent extends SentryEventLike>(event: TEvent) => TEvent;
  readonly traceLifecycle: "static";
  readonly beforeSendSpan: NonNullable<CloudflareOptions["beforeSendSpan"]>;
  readonly beforeSendTransaction: <TEvent extends SentryTransactionLike>(event: TEvent) => TEvent;
}

export const DEFAULT_SENTRY_TRACES_SAMPLE_RATE = 1;

let browserSentryInitialized = false;

interface MetadataOnlySentryDataCollection {
  readonly cookies: false;
  readonly databaseQueryData: false;
  readonly graphQL: { readonly document: false; readonly variables: false };
  readonly frameContextLines: 0;
  readonly genAI: { readonly inputs: false; readonly outputs: false };
  readonly httpBodies: never[];
  readonly httpHeaders: { readonly request: false; readonly response: false };
  readonly queues: false;
  readonly urlQueryParams: false;
  readonly stackFrameVariables: false;
  readonly userInfo: false;
}

export const METADATA_ONLY_SENTRY_DATA_COLLECTION: MetadataOnlySentryDataCollection = {
  cookies: false,
  databaseQueryData: false,
  graphQL: { document: false, variables: false },
  frameContextLines: 0 as const,
  genAI: { inputs: false, outputs: false },
  httpBodies: [],
  httpHeaders: { request: false, response: false },
  queues: false,
  urlQueryParams: false,
  stackFrameVariables: false,
  userInfo: false,
} satisfies NonNullable<CloudflareOptions["dataCollection"]>;

export function cloudflareSentryOptions(
  env: SentryBindings,
  traceNames?: ReadonlySet<string>,
): CloudflareOptions {
  const dsn = optional(env.SENTRY_DSN);
  const environment = optional(env.SENTRY_ENVIRONMENT);
  const release = optional(env.SENTRY_RELEASE);
  const service = optional(env.SENTRY_SERVICE);
  const sanitizationMetadata = sentrySanitizationMetadata({
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    ...(service ? { service } : {}),
  });
  if (traceNames) sanitizationMetadata.traceNames = traceNames;
  return {
    enabled: Boolean(dsn),
    // Worker entrypoints in one isolate have distinct per-invocation span allowlists.
    cacheClient: false,
    ...(dsn ? { dsn } : {}),
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    tracesSampleRate: DEFAULT_SENTRY_TRACES_SAMPLE_RATE,
    traceLifecycle: "static",
    dataCollection: METADATA_ONLY_SENTRY_DATA_COLLECTION,
    maxBreadcrumbs: 0,
    rpcTracePropagationBindings: ["RUNTIME"],
    // Continue inbound traces only when the caller's baggage carries our Sentry org id (extracted
    // from the DSN); arbitrary third-party sentry-trace/baggage on the public edge starts a new
    // trace instead of joining ours.
    strictTraceContinuation: true,
    beforeSend(event) {
      return prepareSentryEvent(event, sanitizationMetadata);
    },
    beforeSendSpan: withStaticSpan((span) => prepareSentrySpan(span, traceNames)),
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

  runtime.init(
    browserSentryOptions(config, router, runtime.routerTracingIntegration, runtime.traceNames),
  );
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
  traceNames?: ReadonlySet<string>,
): BrowserSentryOptions<TIntegration> {
  const sanitizationMetadata = sentrySanitizationMetadata(config);
  if (traceNames) sanitizationMetadata.traceNames = traceNames;
  return {
    dsn: config.dsn,
    enabled: true,
    ...(config.environment ? { environment: config.environment } : {}),
    ...(config.release ? { release: config.release } : {}),
    tracesSampleRate: config.tracesSampleRate,
    traceLifecycle: "static",
    dataCollection: METADATA_ONLY_SENTRY_DATA_COLLECTION,
    maxBreadcrumbs: 0,
    integrations: [routerTracingIntegration(router)],
    beforeSendLog() {
      return null;
    },
    beforeSend(event) {
      return prepareSentryEvent(event, sanitizationMetadata);
    },
    beforeSendSpan: withStaticSpan((span) => prepareSentrySpan(span, traceNames)),
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
