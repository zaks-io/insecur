import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";

export type AuthFailureReason =
  | "missing"
  | "expired"
  | "invalid"
  | "not_admitted"
  | "mfa_enrollment"
  | "mfa_challenge"
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

const AUTH_FAILURE_BODIES: Record<AuthFailureReason, AuthFailure> = {
  missing: {
    code: AUTH_ERROR_CODES.required,
    message: "Authentication is required.",
    retryable: false,
    reason: "missing",
  },
  expired: {
    code: AUTH_ERROR_CODES.expired,
    message: "Authentication has expired.",
    retryable: false,
    reason: "expired",
  },
  invalid: {
    code: AUTH_ERROR_CODES.invalid,
    message: "Authentication is invalid.",
    retryable: false,
    reason: "invalid",
  },
  not_admitted: {
    code: AUTH_ERROR_CODES.required,
    message: "Authentication is required.",
    retryable: false,
    reason: "not_admitted",
  },
  mfa_enrollment: {
    code: AUTH_ERROR_CODES.mfaEnrollmentRequired,
    message: "Multi-factor authentication enrollment is required.",
    retryable: false,
    reason: "mfa_enrollment",
  },
  mfa_challenge: {
    code: AUTH_ERROR_CODES.reauthRequired,
    message: "Multi-factor authentication is required.",
    retryable: false,
    reason: "mfa_challenge",
  },
  insufficient_assurance: {
    code: AUTH_ERROR_CODES.reauthRequired,
    message: "Authentication must be refreshed with a stronger factor.",
    retryable: false,
    reason: "insufficient_assurance",
  },
};

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
  return AUTH_FAILURE_BODIES[reason];
}

/** Stable auth.required failure when a WorkOS identity is not actively admitted. */
export function authFailureForAdmissionDenial(workosUserId: string): AuthFailure {
  return authFailureForReason("not_admitted", { admissionDenial: { workosUserId } });
}
