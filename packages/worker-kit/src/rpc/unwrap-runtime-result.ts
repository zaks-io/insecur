import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";

/**
 * A Runtime RPC failure re-materialized caller-side. Cloudflare RPC does not propagate custom error
 * properties, so the Runtime returns `{ code, retryable }` as data; the caller re-throws this shaped
 * error and the worker-kit error responder reads `code`/`retryable` structurally (ADR-0077).
 *
 * This lives in worker-kit so both the public-edge auth middleware (admission-over-RPC) and the
 * per-app route callers share one implementation.
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

/** Unwrap a Runtime RPC result, throwing the shaped error on failure so call sites stay linear. */
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
