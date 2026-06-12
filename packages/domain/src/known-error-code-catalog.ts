import { ALL_ERROR_CODE_CATALOGS, type KnownErrorCode } from "./error-codes.js";

const KNOWN_ERROR_CODE_CATALOG = ALL_ERROR_CODE_CATALOGS.flatMap((catalog) =>
  Object.values(catalog),
) as KnownErrorCode[];

const KNOWN_ERROR_CODE_SET = new Set<string>(KNOWN_ERROR_CODE_CATALOG);

/** Every stable dotted code declared in domain error-code catalogs. */
export function listKnownErrorCodes(): readonly KnownErrorCode[] {
  return KNOWN_ERROR_CODE_CATALOG;
}

export function isKnownErrorCodeInCatalog(code: string): code is KnownErrorCode {
  return KNOWN_ERROR_CODE_SET.has(code);
}
