import type { SentryBrowserConfig } from "@insecur/observability";
import type { WebEnv } from "./env.js";
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
        workerEnv?: WebEnv;
      };
    };
  }
}
