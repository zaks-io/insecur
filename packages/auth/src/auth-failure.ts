import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";

export type AuthFailureReason =
  | "missing"
  | "expired"
  | "invalid"
  | "not_admitted"
  | "mfa_enrollment"
  | "insufficient_assurance";

export interface AuthFailureAdmissionDenial {
  readonly workosUserId: string;
}

export interface AuthFailure {
  readonly code: AuthErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly reason: AuthFailureReason;
  /** Present when a valid WorkOS identity failed persisted admission resolution. */
  readonly admissionDenial?: AuthFailureAdmissionDenial;
}

export function authFailureForReason(
  reason: AuthFailureReason,
  options?: { readonly admissionDenial?: AuthFailureAdmissionDenial },
): AuthFailure {
  const failure = authFailureBodyForReason(reason);
  if (options?.admissionDenial === undefined) {
    return failure;
  }
  return { ...failure, admissionDenial: options.admissionDenial };
}

function authFailureBodyForReason(reason: AuthFailureReason): AuthFailure {
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

/** Stable auth.required failure when a WorkOS identity is not actively admitted. */
export function authFailureForAdmissionDenial(workosUserId: string): AuthFailure {
  return authFailureForReason("not_admitted", { admissionDenial: { workosUserId } });
}
