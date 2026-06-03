import { AUTH_ERROR_CODES } from "@insecur/domain";

export type AccessDenialPredicate = (error: unknown) => boolean;

export interface AccessDenialAuditOptions {
  /** True when `error` is an access assertion failure with `auth.insufficient_scope`. */
  isAccessDenial: AccessDenialPredicate;
  /** Records the metadata-only denial audit for this call site (event code stays package-specific). */
  recordDenial: () => Promise<void>;
}

/**
 * Returns true when `error` is an `instanceof` `ErrorClass` with `auth.insufficient_scope`.
 */
export function isInsufficientScopeAccessDenial(
  error: unknown,
  ErrorClass: abstract new (...args: never[]) => Error & { readonly code: string },
): boolean {
  return error instanceof ErrorClass && error.code === AUTH_ERROR_CODES.insufficientScope;
}

/**
 * On access denial (`auth.insufficient_scope`), records metadata-only denial audit evidence.
 * Audit-write failures never replace the original access error; the caller must rethrow `error`.
 */
export async function recordAccessDenialOnInsufficientScope(
  error: unknown,
  options: AccessDenialAuditOptions,
): Promise<void> {
  if (!options.isAccessDenial(error)) {
    return;
  }
  try {
    await options.recordDenial();
  } catch {
    // Audit writer failures must not mask the security-relevant access error.
  }
}

/**
 * Runs `fn` and, on `auth.insufficient_scope` access denial, records denial audit evidence
 * before rethrowing the original error unchanged.
 */
export async function runWithAccessDenialAudit<T>(
  fn: () => T | Promise<T>,
  options: AccessDenialAuditOptions,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    await recordAccessDenialOnInsufficientScope(error, options);
    throw error;
  }
}
