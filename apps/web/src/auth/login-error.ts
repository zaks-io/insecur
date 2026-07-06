import type { AuthFailureReason } from "@insecur/auth";

/**
 * Error codes the `/login` page renders from its `?error=` query param. `verification` is the
 * Turnstile failure set by the login POST itself; the rest come from `/auth/callback` when
 * `completeBrowserLogin` fails. Callback failure reasons pass through an explicit allowlist so
 * only actionable session-assurance reasons (ADR-0009/0010) reach the URL; every other reason
 * collapses to the generic `signin` code and leaks no detail (INS-421).
 */
const LOGIN_ERROR_CODES = [
  "verification",
  "signin",
  "mfa_enrollment",
  "insufficient_assurance",
] as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

export function loginErrorCodeForFailure(reason: AuthFailureReason): LoginErrorCode {
  return reason === "mfa_enrollment" || reason === "insufficient_assurance" ? reason : "signin";
}

export function loginFailureRedirectPath(reason: AuthFailureReason): string {
  return `/login?error=${loginErrorCodeForFailure(reason)}`;
}

export function parseLoginErrorCode(value: string | null): LoginErrorCode | null {
  return LOGIN_ERROR_CODES.find((code) => code === value) ?? null;
}

const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  verification: "Verification failed. Try again.",
  signin: "Sign-in failed. Try again.",
  mfa_enrollment:
    "Signing in here requires an authenticator app (TOTP) factor. Enroll one, then sign in again. SMS codes are not accepted.",
  insufficient_assurance:
    "That sign-in method is not accepted for this console. Use a passkey, or a password with an authenticator app (TOTP) code.",
};

export function loginErrorMessage(code: LoginErrorCode): string {
  return LOGIN_ERROR_MESSAGES[code];
}
