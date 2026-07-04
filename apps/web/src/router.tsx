import { initBrowserSentry } from "@insecur/observability";
import { createRouter } from "@tanstack/react-router";
import { getGlobalStartContext } from "@tanstack/react-start";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

type BrowserTracingRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

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

  initBrowserSentry(router, {
    init: (options) => Sentry.init(options as Parameters<typeof Sentry.init>[0]),
    routerTracingIntegration: (sentryRouter) =>
      Sentry.tanstackRouterBrowserTracingIntegration(sentryRouter as BrowserTracingRouter),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
