import { CRYPTO_ERROR_CODES, type CryptoErrorCode } from "@insecur/domain";

/** Opaque decrypt failure; does not distinguish wrong key, tampering, or identity mismatch. */
export class DecryptError extends Error {
  readonly code: CryptoErrorCode = CRYPTO_ERROR_CODES.decryptFailed;
  readonly retryable = false;

  constructor() {
    super("decrypt failed");
    this.name = "DecryptError";
  }
}

/** Free-form AAD field failed charset or control-character validation before seal/open. */
export class InvalidAadFieldError extends Error {
  readonly code: CryptoErrorCode = CRYPTO_ERROR_CODES.invalidAadField;
  readonly retryable = false;
  readonly field: string;

  constructor(field: string) {
    super("invalid aad field");
    this.name = "InvalidAadFieldError";
    this.field = field;
  }
}

/** Root key material is not configured; encrypt and decrypt must fail closed. */
export class RootKeyNotConfiguredError extends Error {
  readonly code: CryptoErrorCode = CRYPTO_ERROR_CODES.rootKeyNotConfigured;
  readonly retryable = false;

  constructor() {
    super("instance root key is not configured");
    this.name = "RootKeyNotConfiguredError";
  }
}

export { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
