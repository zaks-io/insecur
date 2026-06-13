import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";

/**
 * A Runtime RPC failure re-materialized API-side. Cloudflare RPC does not propagate custom error
 * properties, so the Runtime returns `{ code, retryable }` as data; the API re-throws this shaped
 * error and the worker-kit error responder reads `code`/`retryable` structurally (ADR-0077).
 */
export class RuntimeRpcResultError extends Error {
  readonly code: KnownErrorCode;
  readonly retryable: boolean;

  constructor(code: KnownErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "RuntimeRpcResultError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Unwrap a Runtime RPC result, throwing the shaped error on failure so route handling is linear. */
export function unwrapRuntimeResult<TPayload>(result: RuntimeRpcResult<TPayload>): TPayload {
  if (!result.ok) {
    throw new RuntimeRpcResultError(
      result.error.code,
      result.error.message,
      result.error.retryable,
    );
  }
  return result.value;
}
