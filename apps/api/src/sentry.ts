import { cloudflareSentryOptions, type SentryBindings } from "@insecur/observability";
import type { CloudflareOptions } from "@sentry/cloudflare";

export type { SentryBindings } from "@insecur/observability";

type ApiSentryOptions = CloudflareOptions & {
  readonly shouldHandleError?: (error: unknown) => boolean;
};

export function sentryOptions(env: SentryBindings): ApiSentryOptions {
  return {
    ...cloudflareSentryOptions(env),
    shouldHandleError(error: unknown) {
      const status = (error as { status?: unknown }).status;
      return typeof status === "number" ? status >= 500 : true;
    },
  };
}
