import { AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";

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
  [AUTH_ERROR_CODES.insufficientScope]: EXIT_FORBIDDEN,
  [AUTH_ERROR_CODES.highAssuranceRequired]: EXIT_STEP_UP,
  [ONBOARDING_ERROR_CODES.alreadyProvisioned]: EXIT_CONFLICT,
  [ONBOARDING_ERROR_CODES.resourceConflict]: EXIT_CONFLICT,
};

function exitCodeForPrefix(code: KnownErrorCode): number | undefined {
  if (code.startsWith("validation.")) {
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
