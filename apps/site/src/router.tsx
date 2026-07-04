import { initBrowserSentry } from "@insecur/observability";
import { createRouter } from "@tanstack/react-router";
import * as Sentry from "@sentry/tanstackstart-react";
import { routeTree } from "./routeTree.gen";

type BrowserTracingRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });

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
