import { describe, expect, it } from "vitest";

import {
  RuntimeTokenSigningSecretConfigError,
  validateRuntimeTokenSigningSecret,
} from "./runtime-token-signing-secret.js";

const VALID_SECRET = "runtime-hop-secret-0000000000000000000000000000";

describe("validateRuntimeTokenSigningSecret", () => {
  it("accepts a non-empty secret of at least 32 characters", () => {
    expect(() => validateRuntimeTokenSigningSecret(VALID_SECRET)).not.toThrow();
  });

  it("throws when the secret is undefined", () => {
    expect(() => validateRuntimeTokenSigningSecret(undefined)).toThrow(
      RuntimeTokenSigningSecretConfigError,
    );
  });

  it("throws when the secret is empty", () => {
    expect(() => validateRuntimeTokenSigningSecret("")).toThrow(
      RuntimeTokenSigningSecretConfigError,
    );
  });

  it("throws when the secret is blank but 32 characters long", () => {
    expect(() => validateRuntimeTokenSigningSecret("                                ")).toThrow(
      RuntimeTokenSigningSecretConfigError,
    );
  });

  it("throws when the secret is shorter than 32 characters", () => {
    expect(() => validateRuntimeTokenSigningSecret("short-runtime-hop-secret")).toThrow(
      RuntimeTokenSigningSecretConfigError,
    );
  });

  it("exposes auth.config_invalid with retryable false", () => {
    try {
      validateRuntimeTokenSigningSecret("");
    } catch (error) {
      expect(error).toMatchObject({
        name: "RuntimeTokenSigningSecretConfigError",
        code: "auth.config_invalid",
        retryable: false,
      });
      return;
    }
    expect.fail("expected RuntimeTokenSigningSecretConfigError");
  });
});
