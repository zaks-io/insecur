import { AUTH_ERROR_CODES, INJECTION_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secret-store";
import { RootKeyNotConfiguredError } from "@insecur/crypto";
import { describe, expect, it } from "vitest";

import { RuntimeActorTokenError, toRuntimeRpcError } from "./runtime-rpc-error.js";

describe("toRuntimeRpcError", () => {
  it("passes through a domain error's own code and retryable flag", () => {
    const mapped = toRuntimeRpcError(
      new InjectionGrantError(INJECTION_ERROR_CODES.grantExpired, "grant gone"),
    );
    expect(mapped).toEqual({
      code: INJECTION_ERROR_CODES.grantExpired,
      message: "grant gone",
      retryable: false,
    });
  });

  it("carries a secret-write error's retryable flag across the seam", () => {
    const mapped = toRuntimeRpcError(
      new SecretWriteError(VALIDATION_ERROR_CODES.invalidVariableKey, "bad key", true),
    );
    expect(mapped.retryable).toBe(true);
  });

  it("maps the hop-token rejection to its auth code", () => {
    const mapped = toRuntimeRpcError(
      new RuntimeActorTokenError(AUTH_ERROR_CODES.expired, "token expired"),
    );
    expect(mapped.code).toBe(AUTH_ERROR_CODES.expired);
    expect(mapped.retryable).toBe(false);
  });

  it("hides root-key misconfiguration behind a generic validation failure", () => {
    const mapped = toRuntimeRpcError(new RootKeyNotConfiguredError());
    expect(mapped.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
    expect(mapped.message).not.toContain("root");
  });

  it("collapses an unknown error to a non-retryable auth failure", () => {
    const mapped = toRuntimeRpcError(new Error("boom"));
    expect(mapped).toEqual({ code: AUTH_ERROR_CODES.invalid, message: "boom", retryable: false });
  });
});
