import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { httpStatusForKnownErrorCode } from "./domain-error-response.js";

describe("httpStatusForKnownErrorCode", () => {
  it("maps reauth, MFA enrollment, and high-assurance auth codes to 401", () => {
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.reauthRequired)).toBe(401);
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.mfaEnrollmentRequired)).toBe(401);
    expect(httpStatusForKnownErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(401);
  });
});
