import {
  AUDIT_ERROR_CODES,
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  OPERATION_ERROR_CODES,
  SECRET_ERROR_CODES,
  type KnownErrorCode,
} from "@insecur/domain";

/** Stable CLI exit codes (docs/cli-and-sync.md). */
export const EXIT_SUCCESS = 0;
export const EXIT_UNEXPECTED = 1;
export const EXIT_VALIDATION = 2;
export const EXIT_AUTH_REQUIRED = 3;
export const EXIT_FORBIDDEN = 4;
export const EXIT_NOT_FOUND = 5;
export const EXIT_CONFLICT = 6;
export const EXIT_PROVIDER = 7;
export const EXIT_RETRYABLE = 8;
export const EXIT_INCOMPLETE = 9;
export const EXIT_STEP_UP = 10;

const EXACT_EXIT_CODE_BY_ERROR: Partial<Record<KnownErrorCode, number>> = {
  [AUTH_ERROR_CODES.required]: EXIT_AUTH_REQUIRED,
  [AUTH_ERROR_CODES.expired]: EXIT_AUTH_REQUIRED,
  [AUTH_ERROR_CODES.invalid]: EXIT_AUTH_REQUIRED,
  [AUTH_ERROR_CODES.reauthRequired]: EXIT_AUTH_REQUIRED,
  [AUTH_ERROR_CODES.mfaEnrollmentRequired]: EXIT_AUTH_REQUIRED,
  [AUTH_ERROR_CODES.insufficientScope]: EXIT_FORBIDDEN,
  [AUTH_ERROR_CODES.highAssuranceRequired]: EXIT_STEP_UP,
  [ONBOARDING_ERROR_CODES.alreadyProvisioned]: EXIT_CONFLICT,
  [ONBOARDING_ERROR_CODES.resourceConflict]: EXIT_CONFLICT,
  [BOOTSTRAP_ERROR_CODES.alreadyBootstrapped]: EXIT_CONFLICT,
  [BOOTSTRAP_ERROR_CODES.notBootstrapped]: EXIT_NOT_FOUND,
  [BOOTSTRAP_ERROR_CODES.claimNotAvailable]: EXIT_NOT_FOUND,
  [BOOTSTRAP_ERROR_CODES.alreadyClaimed]: EXIT_CONFLICT,
  [BOOTSTRAP_ERROR_CODES.invalidSecret]: EXIT_AUTH_REQUIRED,
  [BOOTSTRAP_ERROR_CODES.authenticatedActorRequired]: EXIT_AUTH_REQUIRED,
  [SECRET_ERROR_CODES.coordinateInvalid]: EXIT_NOT_FOUND,
  [INJECTION_ERROR_CODES.grantDenied]: EXIT_FORBIDDEN,
  [INJECTION_ERROR_CODES.grantExpired]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.notFound]: EXIT_NOT_FOUND,
  [OPERATION_ERROR_CODES.idempotencyMismatch]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.invalidIntent]: EXIT_VALIDATION,
  [OPERATION_ERROR_CODES.invalidMetadata]: EXIT_VALIDATION,
  [OPERATION_ERROR_CODES.staleTransition]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.invalidTransition]: EXIT_VALIDATION,
  [OPERATION_ERROR_CODES.terminalState]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.notCancelable]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.notRetryable]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.targetBusy]: EXIT_RETRYABLE,
  [OPERATION_ERROR_CODES.staleFencingToken]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.leaseNotHeld]: EXIT_CONFLICT,
  [OPERATION_ERROR_CODES.leaseRequired]: EXIT_VALIDATION,
  [INJECTION_ERROR_CODES.decryptFailed]: EXIT_UNEXPECTED,
  [CRYPTO_ERROR_CODES.decryptFailed]: EXIT_UNEXPECTED,
  [CRYPTO_ERROR_CODES.rootKeyNotConfigured]: EXIT_UNEXPECTED,
  [CRYPTO_ERROR_CODES.tenantDataKeyNotReady]: EXIT_UNEXPECTED,
  [CRYPTO_ERROR_CODES.invalidAadField]: EXIT_VALIDATION,
  [AUDIT_ERROR_CODES.eventInvalid]: EXIT_VALIDATION,
};

function exitCodeForPrefix(code: KnownErrorCode): number | undefined {
  if (code.startsWith("validation.")) {
    return EXIT_VALIDATION;
  }
  if (code.startsWith("secret.")) {
    return EXIT_VALIDATION;
  }
  if (code.startsWith("onboarding.")) {
    return EXIT_CONFLICT;
  }
  return undefined;
}

export function exitCodeForErrorCode(code: KnownErrorCode): number {
  return EXACT_EXIT_CODE_BY_ERROR[code] ?? exitCodeForPrefix(code) ?? EXIT_UNEXPECTED;
}
