import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  OPERATION_ERROR_CODES,
  RUNTIME_POLICY_ERROR_CODES,
  type KnownErrorCode,
} from "@insecur/domain";
import type { RuntimeRpcError } from "@insecur/worker-kit";
import * as Sentry from "@sentry/cloudflare";

// These are normal denial/not-found results, including the preview smoke's negative probes.
// Keep this explicit: some configuration failures use validation codes and must still alert.
const EXPECTED_RPC_ERROR_CODES: ReadonlySet<KnownErrorCode> = new Set([
  AUTH_ERROR_CODES.insufficientScope,
  AUTH_ERROR_CODES.highAssuranceRequired,
  INJECTION_ERROR_CODES.grantDenied,
  OPERATION_ERROR_CODES.notFound,
  RUNTIME_POLICY_ERROR_CODES.notFound,
]);

export function captureRuntimeRpcError(error: RuntimeRpcError): void {
  if (!error.retryable && EXPECTED_RPC_ERROR_CODES.has(error.code)) return;

  const sentryError = new Error(error.message);
  sentryError.name = "RuntimeRpcError";

  Sentry.captureException(sentryError, {
    tags: {
      runtime_rpc_code: error.code,
      runtime_rpc_retryable: String(error.retryable),
    },
  });
}
