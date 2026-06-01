import { SECRET_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { SECRET_VALUE_SIZE_LIMIT_BYTES } from "../src/constants.js";
import { SecretWriteError } from "../src/secret-write-error.js";
import { validateTextSecretValue } from "../src/validate-text-secret-value.js";

describe("validateTextSecretValue", () => {
  it("accepts valid UTF-8 within the size limit", () => {
    const value = new TextEncoder().encode("hello-secret");
    expect(() => validateTextSecretValue(value)).not.toThrow();
  });

  it("rejects invalid UTF-8", () => {
    const invalid = Uint8Array.from([0xff, 0xfe, 0xfd]);
    expect(() => validateTextSecretValue(invalid)).toThrow(SecretWriteError);
    try {
      validateTextSecretValue(invalid);
    } catch (error) {
      expect(error).toMatchObject({ code: SECRET_ERROR_CODES.invalidEncoding });
    }
  });

  it("rejects values over 64 KiB", () => {
    const oversized = new Uint8Array(SECRET_VALUE_SIZE_LIMIT_BYTES + 1);
    oversized.fill("a".charCodeAt(0));
    expect(() => validateTextSecretValue(oversized)).toThrow(SecretWriteError);
    try {
      validateTextSecretValue(oversized);
    } catch (error) {
      expect(error).toMatchObject({ code: SECRET_ERROR_CODES.valueTooLarge });
    }
  });

  it("rejects implicit empty values unless allowEmpty is set", () => {
    const empty = new Uint8Array(0);
    expect(() => validateTextSecretValue(empty)).toThrow(SecretWriteError);
    expect(() => validateTextSecretValue(empty, { allowEmpty: true })).not.toThrow();
  });
});
