import {
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  OPERATION_ERROR_CODES,
  requestId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  GENERIC_ERROR_MESSAGE,
  domainErrorEnvelope,
  httpStatusForKnownErrorCode,
} from "./domain-error-response.js";

// A runtime decrypt failure (DecryptError) is thrown inside the Runtime Worker, behind
// the RPC seam. By the time it reaches this public-edge handler it is a structurally-typed
// { code, retryable } value, not a live @insecur/crypto class instance (the public edge
// never imports @insecur/crypto — ADR-0064/0077). This fixture is that seam-crossed shape.
const seamCrossedDecryptError = {
  code: CRYPTO_ERROR_CODES.decryptFailed,
  message: "decrypt failed",
  retryable: false,
};

describe("httpStatusForKnownErrorCode", () => {
  it("maps reauth, MFA enrollment, and high-assurance auth codes to 401", () => {
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.reauthRequired)).toBe(401);
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.mfaEnrollmentRequired)).toBe(401);
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(401);
  });

  it("maps bootstrap and onboarding denial codes without silent 500 fallback", () => {
    expect(httpStatusForKnownErrorCode(BOOTSTRAP_ERROR_CODES.invalidSecret)).toBe(401);
    expect(httpStatusForKnownErrorCode(ONBOARDING_ERROR_CODES.notInstanceOperator)).toBe(403);
    expect(httpStatusForKnownErrorCode(INJECTION_ERROR_CODES.grantDenied)).toBe(404);
    expect(httpStatusForKnownErrorCode(CRYPTO_ERROR_CODES.decryptFailed)).toBe(500);
  });

  it("maps tenant data key readiness failures to HTTP 503", () => {
    expect(httpStatusForKnownErrorCode(CRYPTO_ERROR_CODES.tenantDataKeyNotReady)).toBe(503);
  });

  it("maps a seam-crossed runtime decrypt failure to opaque crypto.decrypt_failed ErrorEnvelope", () => {
    const reqId = requestId.generate();
    const { status, body } = domainErrorEnvelope(seamCrossedDecryptError, reqId);

    expect(status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: CRYPTO_ERROR_CODES.decryptFailed,
        message: "decrypt failed",
        retryable: false,
      },
      meta: { requestId: reqId },
    });
  });

  it("maps a seam-crossed tenant data key readiness failure to crypto.tenant_data_key_not_ready", () => {
    const reqId = requestId.generate();
    const seamCrossedTenantKeyError = {
      code: CRYPTO_ERROR_CODES.tenantDataKeyNotReady,
      message: "tenant data keys are not ready",
      retryable: false,
    };
    const { status, body } = domainErrorEnvelope(seamCrossedTenantKeyError, reqId);

    expect(status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: CRYPTO_ERROR_CODES.tenantDataKeyNotReady,
        message: "tenant data keys are not ready",
        retryable: false,
      },
      meta: { requestId: reqId },
    });
  });

  it("maps TenantDataKeyNotReadyError by error name without falling back to validation.invalid_opaque_resource_id", () => {
    const reqId = requestId.generate();
    const tenantKeyError = Object.assign(new Error("tenant data keys are not ready"), {
      name: "TenantDataKeyNotReadyError",
    });
    const { status, body } = domainErrorEnvelope(tenantKeyError, reqId);

    expect(status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: CRYPTO_ERROR_CODES.tenantDataKeyNotReady,
        message: "tenant data keys are not ready",
      },
      meta: { requestId: reqId },
    });
  });

  it("does not echo dynamic messages from unknown Error instances", () => {
    const reqId = requestId.generate();
    const dynamicError = new Error("super-secret-adjacent diagnostic detail");
    const { body } = domainErrorEnvelope(dynamicError, reqId);

    expect(body).toMatchObject({
      ok: false,
      error: {
        message: GENERIC_ERROR_MESSAGE,
      },
    });
    expect(body.error.message).not.toContain("super-secret-adjacent");
  });

  it("does not echo dynamic messages from known typed errors with caller-supplied copy", () => {
    const reqId = requestId.generate();
    const operationStoreError = Object.assign(
      new Error("idempotency key reused with a different intent code"),
      {
        name: "OperationStoreError",
        code: OPERATION_ERROR_CODES.idempotencyMismatch,
        retryable: false,
      },
    );
    const { status, body } = domainErrorEnvelope(operationStoreError, reqId);

    expect(status).toBe(409);
    expect(httpStatusForKnownErrorCode(OPERATION_ERROR_CODES.idempotencyMismatch)).toBe(409);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: OPERATION_ERROR_CODES.idempotencyMismatch,
        message: GENERIC_ERROR_MESSAGE,
        retryable: false,
      },
      meta: { requestId: reqId },
    });
  });
});
