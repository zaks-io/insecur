import {
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  requestId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { domainErrorEnvelope, httpStatusForKnownErrorCode } from "./domain-error-response.js";

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

  it("maps a seam-crossed runtime decrypt failure to opaque crypto.decrypt_failed ErrorEnvelope", () => {
    const reqId = requestId.generate();
    const { status, body } = domainErrorEnvelope(seamCrossedDecryptError, reqId);

    expect(status).toBe(500);
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: CRYPTO_ERROR_CODES.decryptFailed,
        retryable: false,
      },
      meta: { requestId: reqId },
    });
  });
});
