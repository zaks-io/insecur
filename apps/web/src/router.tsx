import type { SentryBrowserConfig } from "@insecur/observability";
import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

type BrowserTracingRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

let browserSentryInitialized = false;

function readCspNonceFromRequestContext(): string | undefined {
  try {
    const context = getGlobalStartContext();
    const nonce = context?.nonce;
    return typeof nonce === "string" && nonce.length > 0 ? nonce : undefined;
  } catch {
    return undefined;
  }
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  });

  const nonce = readCspNonceFromRequestContext();
  if (nonce) {
    router.update({ ssr: { nonce } });
  }

  initBrowserSentry(router);

  return router;
}

function initBrowserSentry(router: unknown): void {
  const config = readBrowserSentryConfig();
  if (!config) {
    return;
  }

  Sentry.init(browserSentryOptions(config, router));
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

function browserSentryOptions(config: SentryBrowserConfig, router: unknown) {
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
    integrations:
      config.tracesSampleRate === undefined
        ? []
        : [Sentry.tanstackRouterBrowserTracingIntegration(router as BrowserTracingRouter)],
  };
}

declare global {
  interface Window {
    __INSECUR_SENTRY?: SentryBrowserConfig;
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
