/** Explicit Provider Lookup and provider pre-write failures (docs/cli-and-sync.md §Verify). */
export const PROVIDER_ERROR_CODES = {
  lookupNotFound: "provider.lookup_not_found",
  permissionDenied: "provider.permission_denied",
  boundaryMismatch: "provider.boundary_mismatch",
  unavailable: "provider.unavailable",
} as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[keyof typeof PROVIDER_ERROR_CODES];

/** Provider App Registration metadata failures. */
export const PROVIDER_APP_REGISTRATION_ERROR_CODES = {
  notFound: "provider_app_registration.not_found",
  notConfigured: "provider_app_registration.not_configured",
  alreadyExists: "provider_app_registration.already_exists",
} as const;

export type ProviderAppRegistrationErrorCode =
  (typeof PROVIDER_APP_REGISTRATION_ERROR_CODES)[keyof typeof PROVIDER_APP_REGISTRATION_ERROR_CODES];
