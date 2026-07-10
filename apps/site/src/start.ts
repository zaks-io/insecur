import type { SentryBrowserConfig } from "@insecur/observability";
import { createStart } from "@tanstack/react-start";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";

const requestMiddleware = [sentryGlobalRequestMiddleware];
const functionMiddleware = [sentryGlobalFunctionMiddleware];

export const startInstance = createStart(() => ({
  requestMiddleware,
  functionMiddleware,
}));

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        sentry?: SentryBrowserConfig;
        host?: string;
      };
    };
  }
}
