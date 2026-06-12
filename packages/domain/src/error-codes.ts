/**
 * Stable dotted error codes shared across packages.
 * Extend per-package catalogs in later slices; domain holds cross-cutting validation codes.
 */
export const VALIDATION_ERROR_CODES = {
  invalidOpaqueResourceId: "validation.invalid_opaque_resource_id",
  invalidDisplayName: "validation.invalid_display_name",
  displayNameEmpty: "validation.display_name_empty",
  invalidVariableKey: "validation.invalid_variable_key",
} as const;

export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

/** Scaffolding for known auth error codes (implementation in access/auth slices). */
export const AUTH_ERROR_CODES = {
  required: "auth.required",
  expired: "auth.expired",
  invalid: "auth.invalid",
  insufficientScope: "auth.insufficient_scope",
  reauthRequired: "auth.reauth_required",
  highAssuranceRequired: "auth.high_assurance_required",
  mfaEnrollmentRequired: "auth.mfa_enrollment_required",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Scaffolding for secret-write error codes (implementation in secrets slice). */
export const SECRET_ERROR_CODES = {
  invalidEncoding: "secret.invalid_encoding",
  emptyValue: "secret.empty_value",
  inputRequired: "secret.input_required",
  valueTooLarge: "secret.value_too_large",
} as const;

export type SecretErrorCode = (typeof SECRET_ERROR_CODES)[keyof typeof SECRET_ERROR_CODES];

/** Scaffolding for runtime injection error codes. */
export const INJECTION_ERROR_CODES = {
  grantDenied: "injection.grant_denied",
  grantExpired: "injection.grant_expired",
  decryptFailed: "injection.decrypt_failed",
} as const;

export type InjectionErrorCode = (typeof INJECTION_ERROR_CODES)[keyof typeof INJECTION_ERROR_CODES];

/** Guided Organization Provisioning error codes. */
export const ONBOARDING_ERROR_CODES = {
  alreadyProvisioned: "onboarding.already_provisioned",
  resourceConflict: "onboarding.resource_conflict",
  notInstanceOperator: "onboarding.not_instance_operator",
  invitationInvalid: "onboarding.invitation_invalid",
  invitationNotPending: "onboarding.invitation_not_pending",
  invitationInviteeMismatch: "onboarding.invitation_invitee_mismatch",
  membershipAlreadyExists: "onboarding.membership_already_exists",
} as const;

/** Instance bootstrap and Bootstrap Operator Claim error codes. */
export const BOOTSTRAP_ERROR_CODES = {
  alreadyBootstrapped: "bootstrap.already_bootstrapped",
  notBootstrapped: "bootstrap.not_bootstrapped",
  claimNotAvailable: "bootstrap.claim_not_available",
  alreadyClaimed: "bootstrap.already_claimed",
  invalidSecret: "bootstrap.invalid_secret",
  authenticatedActorRequired: "bootstrap.authenticated_actor_required",
} as const;

export type BootstrapErrorCode = (typeof BOOTSTRAP_ERROR_CODES)[keyof typeof BOOTSTRAP_ERROR_CODES];

export type OnboardingErrorCode =
  (typeof ONBOARDING_ERROR_CODES)[keyof typeof ONBOARDING_ERROR_CODES];

/** Crypto package failures surfaced to callers (decrypt remains opaque). */
export const CRYPTO_ERROR_CODES = {
  decryptFailed: "crypto.decrypt_failed",
  rootKeyNotConfigured: "crypto.root_key_not_configured",
  invalidAadField: "crypto.invalid_aad_field",
} as const;

export type CryptoErrorCode = (typeof CRYPTO_ERROR_CODES)[keyof typeof CRYPTO_ERROR_CODES];

/** Tenant-scoped store configuration and runtime failures. */
export const STORE_ERROR_CODES = {
  runtimeConfigMissing: "store.runtime_config_missing",
} as const;

export type StoreErrorCode = (typeof STORE_ERROR_CODES)[keyof typeof STORE_ERROR_CODES];

/** Audit event writer validation failures. */
export const AUDIT_ERROR_CODES = {
  eventInvalid: "audit.event_invalid",
} as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[keyof typeof AUDIT_ERROR_CODES];

/**
 * Every `*_ERROR_CODES` catalog in this module. Append new catalogs here and to
 * `KnownErrorCode` so `known-error-code-catalog.ts` lockstep coverage cannot miss them.
 */
export const ALL_ERROR_CODE_CATALOGS = [
  VALIDATION_ERROR_CODES,
  AUTH_ERROR_CODES,
  SECRET_ERROR_CODES,
  INJECTION_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  STORE_ERROR_CODES,
  AUDIT_ERROR_CODES,
] as const;

export type KnownErrorCode =
  | ValidationErrorCode
  | AuthErrorCode
  | SecretErrorCode
  | InjectionErrorCode
  | OnboardingErrorCode
  | BootstrapErrorCode
  | CryptoErrorCode
  | StoreErrorCode
  | AuditErrorCode
  | (string & {});
