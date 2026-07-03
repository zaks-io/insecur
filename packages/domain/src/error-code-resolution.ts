import { VALIDATION_ERROR_CODES, type KnownErrorCode } from "./error-codes.js";

/**
 * Single reconciled fallback code for an error that carries no recognizable `code`. Both the
 * Runtime RPC seam (`apps/runtime`) and the public-edge HTTP seam (`packages/worker-kit`) resolve
 * an unknown error to this same code so a caller sees one status for the same underlying condition
 * regardless of which seam it crossed. Historically these two seams disagreed (`auth.invalid` at
 * the Runtime, `invalid_opaque_resource_id` at the edge); the edge value wins because it is the one
 * the external caller actually observes, and reporting an internal defect as an auth failure is
 * misleading.
 */
export const DEFAULT_UNKNOWN_ERROR_CODE: KnownErrorCode =
  VALIDATION_ERROR_CODES.invalidOpaqueResourceId;

/**
 * Read a `code` own-property off any error value. Domain error classes carry their own
 * `KnownErrorCode`, and codes crossing the Runtime RPC seam arrive as a structural `{ code }` on a
 * plain object (class identity does not survive the boundary), so this covers both.
 */
export function readErrorCode(error: unknown): KnownErrorCode | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

/** Read a boolean `retryable` own-property, defaulting to non-retryable when absent. */
export function readRetryable(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "retryable" in error) {
    const { retryable } = error;
    if (typeof retryable === "boolean") {
      return retryable;
    }
  }
  return false;
}

/**
 * Resolve any error to a stable `KnownErrorCode`, falling back to {@link DEFAULT_UNKNOWN_ERROR_CODE}.
 * Callers that also match specific class instances (for classes that do not expose `code`) should
 * apply those checks first and use this as the terminal fallback so the unknown-error code stays
 * identical across seams.
 */
export function resolveKnownErrorCode(error: unknown): KnownErrorCode {
  return readErrorCode(error) ?? DEFAULT_UNKNOWN_ERROR_CODE;
}
