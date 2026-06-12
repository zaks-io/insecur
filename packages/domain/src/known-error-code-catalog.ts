import {
  AUDIT_ERROR_CODES,
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  SECRET_ERROR_CODES,
  STORE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  type KnownErrorCode,
} from "./error-codes.js";

const KNOWN_ERROR_CODE_CATALOG = [
  ...Object.values(VALIDATION_ERROR_CODES),
  ...Object.values(AUTH_ERROR_CODES),
  ...Object.values(SECRET_ERROR_CODES),
  ...Object.values(INJECTION_ERROR_CODES),
  ...Object.values(ONBOARDING_ERROR_CODES),
  ...Object.values(BOOTSTRAP_ERROR_CODES),
  ...Object.values(CRYPTO_ERROR_CODES),
  ...Object.values(STORE_ERROR_CODES),
  ...Object.values(AUDIT_ERROR_CODES),
] as const satisfies readonly KnownErrorCode[];

const KNOWN_ERROR_CODE_SET = new Set<string>(KNOWN_ERROR_CODE_CATALOG);

/** Every stable dotted code declared in domain error-code catalogs. */
export function listKnownErrorCodes(): readonly KnownErrorCode[] {
  return KNOWN_ERROR_CODE_CATALOG;
}

export function isKnownErrorCodeInCatalog(code: string): code is KnownErrorCode {
  return KNOWN_ERROR_CODE_SET.has(code);
}
