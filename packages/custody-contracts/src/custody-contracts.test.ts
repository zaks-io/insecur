import { CRYPTO_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertDataKeyStatusTransition,
  canRetireRootKeyBinding,
  DATA_KEY_VERSION_STATUSES,
  isDataKeyVersionStatus,
  TenantDataKeyNotReadyError,
  toStoreFacingCiphertext,
} from "./index.js";

describe("data key lifecycle contract", () => {
  it("recognizes the stable data key statuses", () => {
    expect(DATA_KEY_VERSION_STATUSES).toEqual(["active", "retired", "revoked"]);
    expect(isDataKeyVersionStatus("active")).toBe(true);
    expect(isDataKeyVersionStatus("missing")).toBe(false);
  });

  it("allows only one-way data key status transitions", () => {
    expect(() => {
      assertDataKeyStatusTransition("active", "retired");
    }).not.toThrow();
    expect(() => {
      assertDataKeyStatusTransition("active", "revoked");
    }).not.toThrow();
    expect(() => {
      assertDataKeyStatusTransition("retired", "active");
    }).toThrow("invalid data key status transition");
  });

  it("requires all tenant data keys to move off an old root before retirement", () => {
    expect(canRetireRootKeyBinding([{ rootKeyVersion: 2 }], 1)).toBe(true);
    expect(canRetireRootKeyBinding([{ rootKeyVersion: 1 }, { rootKeyVersion: 2 }], 1)).toBe(false);
  });
});

describe("wrapped material contract", () => {
  it("stores only caller-facing ciphertext bytes", () => {
    const ciphertext = Uint8Array.from([1, 2, 3]);

    expect(toStoreFacingCiphertext({ ciphertext })).toBe(ciphertext);
  });
});

describe("TenantDataKeyNotReadyError", () => {
  it("uses the shared crypto readiness code", () => {
    const error = new TenantDataKeyNotReadyError();

    expect(error.name).toBe("TenantDataKeyNotReadyError");
    expect(error.code).toBe(CRYPTO_ERROR_CODES.tenantDataKeyNotReady);
    expect(error.retryable).toBe(false);
  });
});
