import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";

export type AuthFailureReason =
  | "missing"
  | "expired"
  | "invalid"
  | "not_admitted"
  | "mfa_enrollment"
  | "insufficient_assurance";

export interface AuthFailure {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly reason: AuthFailureReason;
}

export function authFailureForReason(reason: AuthFailureReason): AuthFailure {
  switch (reason) {
    case "missing":
      return {
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required.",
        retryable: false,
        reason,
      };
    case "expired":
      return {
        code: AUTH_ERROR_CODES.expired,
        message: "Authentication has expired.",
        retryable: false,
        reason,
      };
    case "invalid":
      return {
        code: AUTH_ERROR_CODES.invalid,
        message: "Authentication is invalid.",
        retryable: false,
        reason,
      };
    case "not_admitted":
      return {
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required.",
        retryable: false,
        reason,
      };
    case "mfa_enrollment":
      return {
        code: AUTH_ERROR_CODES.mfaEnrollmentRequired,
        message: "Multi-factor authentication enrollment is required.",
        retryable: false,
        reason,
      };
    case "insufficient_assurance":
      return {
        code: AUTH_ERROR_CODES.reauthRequired,
        message: "Authentication must be refreshed with a stronger factor.",
        retryable: false,
        reason,
      };
  }
}
