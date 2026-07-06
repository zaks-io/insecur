import type { AuthFailureReason } from "@insecur/auth";
import { describe, expect, it } from "vitest";
import {
  loginErrorCodeForFailure,
  loginErrorMessage,
  loginFailureRedirectPath,
  parseLoginErrorCode,
} from "./login-error.js";

describe("loginErrorCodeForFailure", () => {
  it.each(["mfa_enrollment", "insufficient_assurance"] as const)(
    "surfaces the actionable assurance reason %s as its own code",
    (reason) => {
      expect(loginErrorCodeForFailure(reason)).toBe(reason);
      expect(loginFailureRedirectPath(reason)).toBe(`/login?error=${reason}`);
    },
  );

  it.each([
    "missing",
    "expired",
    "invalid",
    "not_admitted",
    "mfa_challenge",
  ] satisfies readonly AuthFailureReason[])(
    "collapses every other failure reason (%s) to the generic signin code",
    (reason) => {
      expect(loginErrorCodeForFailure(reason)).toBe("signin");
      expect(loginFailureRedirectPath(reason)).toBe("/login?error=signin");
    },
  );
});

describe("parseLoginErrorCode", () => {
  it.each(["verification", "signin", "mfa_enrollment", "insufficient_assurance"] as const)(
    "accepts the allowlisted code %s",
    (code) => {
      expect(parseLoginErrorCode(code)).toBe(code);
    },
  );

  it("rejects absent and unknown values so arbitrary query strings never reach the page", () => {
    expect(parseLoginErrorCode(null)).toBeNull();
    expect(parseLoginErrorCode("")).toBeNull();
    expect(parseLoginErrorCode("not_admitted")).toBeNull();
    expect(parseLoginErrorCode("<script>alert(1)</script>")).toBeNull();
  });
});

describe("loginErrorMessage", () => {
  it("keeps the Turnstile failure copy", () => {
    expect(loginErrorMessage("verification")).toBe("Verification failed. Try again.");
  });

  it("tells enrollment-blocked members to enroll a TOTP factor and that SMS is not accepted", () => {
    const message = loginErrorMessage("mfa_enrollment");
    expect(message).toContain("authenticator app (TOTP)");
    expect(message).toContain("SMS codes are not accepted");
  });

  it("tells insufficient-assurance members which sign-in methods are accepted", () => {
    const message = loginErrorMessage("insufficient_assurance");
    expect(message).toContain("not accepted");
    expect(message).toContain("passkey");
    expect(message).toContain("authenticator app (TOTP)");
  });

  it("keeps the generic failure copy detail-free", () => {
    expect(loginErrorMessage("signin")).toBe("Sign-in failed. Try again.");
  });
});
