import { CRYPTO_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { DecryptError, InvalidAadFieldError, RootKeyNotConfiguredError } from "../src/errors.js";

describe("crypto ErrorBody-compatible failures", () => {
  it("DecryptError carries a known code and retryable flag", () => {
    const error = new DecryptError();
    expect(error.code).toBe(CRYPTO_ERROR_CODES.decryptFailed);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("decrypt failed");
  });

  it("RootKeyNotConfiguredError carries a known code and retryable flag", () => {
    const error = new RootKeyNotConfiguredError();
    expect(error.code).toBe(CRYPTO_ERROR_CODES.rootKeyNotConfigured);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("instance root key is not configured");
  });

  it("InvalidAadFieldError carries a known code and field name", () => {
    const error = new InvalidAadFieldError("metadataType");
    expect(error.code).toBe(CRYPTO_ERROR_CODES.invalidAadField);
    expect(error.retryable).toBe(false);
    expect(error.field).toBe("metadataType");
  });

  it("TenantDataKeyNotReadyError carries a known code and retryable flag", async () => {
    const { TenantDataKeyNotReadyError } = await import("../src/keyring-readiness.js");
    const error = new TenantDataKeyNotReadyError();
    expect(error.code).toBe(CRYPTO_ERROR_CODES.tenantDataKeyNotReady);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("tenant data keys are not ready");
  });
});
