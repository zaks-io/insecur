import type { SentryBrowserConfig } from "@insecur/observability";
import { createStart } from "@tanstack/react-start";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";

export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}));

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        nonce?: string;
        sentry?: SentryBrowserConfig;
        host?: string;
      };
    };
  }
}
