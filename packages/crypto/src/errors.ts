/** Opaque decrypt failure; does not distinguish wrong key, tampering, or identity mismatch. */
export class DecryptError extends Error {
  constructor() {
    super("decrypt failed");
    this.name = "DecryptError";
  }
}

/** Root key material is not configured; encrypt and decrypt must fail closed. */
export class RootKeyNotConfiguredError extends Error {
  constructor() {
    super("instance root key is not configured");
    this.name = "RootKeyNotConfiguredError";
  }
}

export { TenantDataKeyNotReadyError } from "./keyring-readiness.js";
