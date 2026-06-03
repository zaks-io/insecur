export interface AccessDenialAuditOptions {
  /** True when the failure is an access assertion denied with insufficient scope. */
  isAccessDenied: (error: unknown) => boolean;
  /** Records the package-specific metadata-only denial audit event. */
  recordDenied: () => Promise<void>;
}

/**
 * On access denial, records a metadata-only denial audit without masking the original error.
 * Call from a `catch` block and rethrow the same `error` afterward.
 */
export async function auditAccessDenialOnFailure(
  error: unknown,
  options: AccessDenialAuditOptions,
): Promise<void> {
  if (!options.isAccessDenied(error)) {
    return;
  }
  try {
    await options.recordDenied();
  } catch {
    // Audit write failure must never replace the security-relevant access error.
  }
}

/**
 * Runs an async operation; on access denial records denial audit then rethrows the original error.
 */
export async function runWithAccessDenialAudit<T>(
  run: () => Promise<T>,
  options: AccessDenialAuditOptions,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    await auditAccessDenialOnFailure(error, options);
    throw error;
  }
}
