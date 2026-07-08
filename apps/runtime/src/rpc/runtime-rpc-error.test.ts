import {
  AUTH_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  DEFAULT_UNKNOWN_ERROR_CODE,
  INJECTION_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { InjectionGrantError } from "@insecur/runtime-injection";
import { SecretWriteError } from "@insecur/secret-store";
import { RootKeyNotConfiguredError, TenantDataKeyNotReadyError } from "@insecur/crypto";
import { describe, expect, it } from "vitest";

import { RuntimeActorTokenError, toRuntimeRpcError } from "./runtime-rpc-error.js";
import { RuntimeTokenSigningSecretConfigError } from "@insecur/worker-kit";
import { AuditExportKeysNotConfiguredError } from "../crypto/audit-export-keys-not-configured-error.js";
import { AuditExportEntryLimitExceededError, AUDIT_EXPORT_MAX_ENTRY_COUNT } from "@insecur/audit";
import { AUDIT_ERROR_CODES } from "@insecur/domain";

const SENTINEL = "sentinel-plaintext-must-not-cross-seam";
const RUNTIME_RPC_GENERIC_MESSAGE = "runtime request failed";

describe("toRuntimeRpcError", () => {
  it("preserves a domain error code and retryable flag but suppresses raw message text", () => {
    const mapped = toRuntimeRpcError(
      new InjectionGrantError(INJECTION_ERROR_CODES.grantExpired, SENTINEL),
    );
    expect(mapped).toEqual({
      code: INJECTION_ERROR_CODES.grantExpired,
      message: RUNTIME_RPC_GENERIC_MESSAGE,
      retryable: false,
    });
    expect(mapped.message).not.toContain(SENTINEL);
  });

  it("carries a secret-write error's retryable flag across the seam without raw message text", () => {
    const mapped = toRuntimeRpcError(
      new SecretWriteError(VALIDATION_ERROR_CODES.invalidVariableKey, SENTINEL, true),
    );
    expect(mapped.code).toBe(VALIDATION_ERROR_CODES.invalidVariableKey);
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).toBe(RUNTIME_RPC_GENERIC_MESSAGE);
    expect(mapped.message).not.toContain(SENTINEL);
  });

  it("maps the hop-token rejection to its auth code with a safe message", () => {
    const mapped = toRuntimeRpcError(
      new RuntimeActorTokenError(AUTH_ERROR_CODES.expired, SENTINEL),
    );
    expect(mapped.code).toBe(AUTH_ERROR_CODES.expired);
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).toBe(RUNTIME_RPC_GENERIC_MESSAGE);
    expect(mapped.message).not.toContain(SENTINEL);
  });

  it("maps hop-token signing secret misconfiguration to an allowlisted safe message", () => {
    const mapped = toRuntimeRpcError(new RuntimeTokenSigningSecretConfigError());
    expect(mapped).toEqual({
      code: AUTH_ERROR_CODES.configInvalid,
      message:
        "runtime configuration invalid: runtimeTokenSigningSecret must be a non-empty value of at least 32 characters",
      retryable: false,
    });
  });

  it("hides root-key misconfiguration behind a generic validation failure", () => {
    const mapped = toRuntimeRpcError(new RootKeyNotConfiguredError());
    expect(mapped.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
    expect(mapped.message).not.toContain("root");
  });

  it("hides audit-export key misconfiguration behind a generic validation failure", () => {
    const mapped = toRuntimeRpcError(new AuditExportKeysNotConfiguredError());
    expect(mapped.code).toBe(VALIDATION_ERROR_CODES.invalidOpaqueResourceId);
    expect(mapped.message).toBe("runtime audit export keys are unavailable");
    expect(mapped.message).not.toContain("private");
  });

  it("maps audit export entry cap failures with a stable code and actionable message", () => {
    const mapped = toRuntimeRpcError(
      new AuditExportEntryLimitExceededError(AUDIT_EXPORT_MAX_ENTRY_COUNT),
    );
    expect(mapped).toEqual({
      code: AUDIT_ERROR_CODES.exportEntryLimitExceeded,
      message: expect.stringContaining(String(AUDIT_EXPORT_MAX_ENTRY_COUNT)),
      retryable: false,
    });
  });

  it("carries tenant data key readiness failures with an allowlisted safe message", () => {
    const mapped = toRuntimeRpcError(new TenantDataKeyNotReadyError());
    expect(mapped.code).toBe(CRYPTO_ERROR_CODES.tenantDataKeyNotReady);
    expect(mapped.message).toBe("tenant data keys are not ready");
    expect(mapped.retryable).toBe(false);
  });

  it("collapses an unknown error to the shared cross-seam fallback code with a fixed message", () => {
    const mapped = toRuntimeRpcError(new Error(SENTINEL));
    expect(mapped).toEqual({
      code: DEFAULT_UNKNOWN_ERROR_CODE,
      message: RUNTIME_RPC_GENERIC_MESSAGE,
      retryable: false,
    });
    expect(mapped.message).not.toContain(SENTINEL);
  });

  it("preserves a structured code but still suppresses the raw message", () => {
    const mapped = toRuntimeRpcError({
      code: AUTH_ERROR_CODES.insufficientScope,
      message: SENTINEL,
    });
    expect(mapped.code).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(mapped.message).toBe(RUNTIME_RPC_GENERIC_MESSAGE);
    expect(mapped.message).not.toContain(SENTINEL);
  });
});
