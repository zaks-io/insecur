import type { RuntimeRpcError } from "@insecur/worker-kit";
import * as Sentry from "@sentry/cloudflare";

export function captureRuntimeRpcError(error: RuntimeRpcError): void {
  const sentryError = new Error(error.message);
  sentryError.name = "RuntimeRpcError";

  Sentry.captureException(sentryError, {
    tags: {
      runtime_rpc_code: error.code,
      runtime_rpc_retryable: String(error.retryable),
    },
  });
}
