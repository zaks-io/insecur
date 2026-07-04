import { createStart } from "@tanstack/react-start";
import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import type { SentryBrowserConfig } from "./sentry.js";

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
      };
    };
  }
}
