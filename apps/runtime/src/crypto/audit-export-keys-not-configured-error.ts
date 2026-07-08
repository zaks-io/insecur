/** Audit export HMAC/signing keys are not available from Runtime Secrets Store bindings. */
export class AuditExportKeysNotConfiguredError extends Error {
  readonly retryable = false;

  constructor() {
    super("audit export signing keys are not configured");
    this.name = "AuditExportKeysNotConfiguredError";
  }
}
