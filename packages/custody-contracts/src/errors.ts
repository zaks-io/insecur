import { CRYPTO_ERROR_CODES, type CryptoErrorCode } from "@insecur/domain";

/** Active tenant data keys are missing or not usable for decrypt paths. */
export class TenantDataKeyNotReadyError extends Error {
  readonly code: CryptoErrorCode = CRYPTO_ERROR_CODES.tenantDataKeyNotReady;
  readonly retryable = false;

  constructor() {
    super("tenant data keys are not ready");
    this.name = "TenantDataKeyNotReadyError";
  }
}
