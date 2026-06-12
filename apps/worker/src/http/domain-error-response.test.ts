import {
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { httpStatusForKnownErrorCode } from "./domain-error-response.js";

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
});
