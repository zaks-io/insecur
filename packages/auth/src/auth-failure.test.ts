import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { authFailureForAdmissionDenial, authFailureForReason } from "./auth-failure.js";

describe("auth ErrorBody-compatible failures", () => {
  it("authFailureForReason returns code and retryable for each reason", () => {
    const failure = authFailureForReason("missing");
    expect(failure.code).toBe(AUTH_ERROR_CODES.required);
    expect(failure.retryable).toBe(false);
    expect(failure.message.length).toBeGreaterThan(0);
  });

  it("maps MFA enrollment to auth.mfa_enrollment_required", () => {
    const failure = authFailureForReason("mfa_enrollment");
    expect(failure.code).toBe(AUTH_ERROR_CODES.mfaEnrollmentRequired);
  });

  it("maps insufficient assurance to auth.reauth_required", () => {
    const failure = authFailureForReason("insufficient_assurance");
    expect(failure.code).toBe(AUTH_ERROR_CODES.reauthRequired);
  });

  it("authFailureForAdmissionDenial attaches workosUserId for denied-attempt audit", () => {
    const failure = authFailureForAdmissionDenial("user_01workos");
    expect(failure.reason).toBe("not_admitted");
    expect(failure.code).toBe(AUTH_ERROR_CODES.required);
    expect(failure.admissionDenial?.workosUserId).toBe("user_01workos");
  });
});
