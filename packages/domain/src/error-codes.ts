/**
 * Stable dotted error codes shared across packages.
 * Extend per-package catalogs in later slices; domain holds cross-cutting validation codes.
 */
export const VALIDATION_ERROR_CODES = {
  invalidOpaqueResourceId: "validation.invalid_opaque_resource_id",
  invalidDisplayName: "validation.invalid_display_name",
  displayNameEmpty: "validation.display_name_empty",
  invalidVariableKey: "validation.invalid_variable_key",
  invalidCommandInput: "validation.invalid_command_input",
  invalidFeedbackKind: "validation.invalid_feedback_kind",
  feedbackAssociationRequired: "validation.feedback_association_required",
} as const;

export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

/** Scaffolding for known auth error codes (implementation in access/auth slices). */
export const AUTH_ERROR_CODES = {
  required: "auth.required",
  configInvalid: "auth.config_invalid",
  expired: "auth.expired",
  invalid: "auth.invalid",
  insufficientScope: "auth.insufficient_scope",
  reauthRequired: "auth.reauth_required",
  highAssuranceRequired: "auth.high_assurance_required",
  mfaEnrollmentRequired: "auth.mfa_enrollment_required",
  oidcWrongAudience: "auth.oidc_wrong_audience",
  oidcWrongRepository: "auth.oidc_wrong_repository",
  oidcWrongEnvironment: "auth.oidc_wrong_environment",
  oidcUntrustedSource: "auth.oidc_untrusted_source",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Scaffolding for secret-write error codes (implementation in secrets slice). */
export const SECRET_ERROR_CODES = {
  invalidEncoding: "secret.invalid_encoding",
  invalidInputMode: "secret.invalid_input_mode",
  emptyValue: "secret.empty_value",
  inputRequired: "secret.input_required",
  valueTooLarge: "secret.value_too_large",
  /**
   * The URL environment does not belong to the URL project (or does not exist). Collapses
   * not-found and not-owned into one 404 so the write path cannot reveal whether a foreign
   * environment exists, mirroring `injection.grant_denied`.
   */
  coordinateInvalid: "secret.coordinate_invalid",
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

/** Environment lifecycle and posture validation failures. */
export const ENVIRONMENT_ERROR_CODES = {
  invalidLifecycleStage: "environment.invalid_lifecycle_stage",
  protectedEnvironment: "environment.protected_environment",
  lifecycleImmutable: "environment.lifecycle_immutable",
  previewOptDownInvalid: "environment.preview_opt_down_invalid",
  notFound: "environment.not_found",
} as const;

export type EnvironmentErrorCode =
  (typeof ENVIRONMENT_ERROR_CODES)[keyof typeof ENVIRONMENT_ERROR_CODES];

/** Crypto package failures surfaced to callers (decrypt remains opaque). */
export const CRYPTO_ERROR_CODES = {
  decryptFailed: "crypto.decrypt_failed",
  rootKeyNotConfigured: "crypto.root_key_not_configured",
  tenantDataKeyNotReady: "crypto.tenant_data_key_not_ready",
  invalidAadField: "crypto.invalid_aad_field",
} as const;

export type CryptoErrorCode = (typeof CRYPTO_ERROR_CODES)[keyof typeof CRYPTO_ERROR_CODES];

/** Tenant-scoped store configuration and runtime failures. */
export const STORE_ERROR_CODES = {
  runtimeConfigMissing: "store.runtime_config_missing",
} as const;

export type StoreErrorCode = (typeof STORE_ERROR_CODES)[keyof typeof STORE_ERROR_CODES];

/** Public-edge abuse controls (rate limiting). */
export const ABUSE_ERROR_CODES = {
  rateLimited: "abuse.rate_limited",
} as const;

export type AbuseErrorCode = (typeof ABUSE_ERROR_CODES)[keyof typeof ABUSE_ERROR_CODES];

/** Audit event writer validation failures. */
export const AUDIT_ERROR_CODES = {
  eventInvalid: "audit.event_invalid",
} as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[keyof typeof AUDIT_ERROR_CODES];

/** Operation Store metadata-only workflow failures. */
export const OPERATION_ERROR_CODES = {
  notFound: "operation.not_found",
  idempotencyMismatch: "operation.idempotency_mismatch",
  invalidIntent: "operation.invalid_intent",
  invalidMetadata: "operation.invalid_metadata",
  staleTransition: "operation.stale_transition",
  invalidTransition: "operation.invalid_transition",
  terminalState: "operation.terminal_state",
  notCancelable: "operation.not_cancelable",
  notRetryable: "operation.not_retryable",
  targetBusy: "sync.target_busy",
  staleFencingToken: "operation.stale_fencing_token",
  leaseNotHeld: "operation.lease_not_held",
  leaseRequired: "operation.lease_required",
} as const;

export type OperationErrorCode = (typeof OPERATION_ERROR_CODES)[keyof typeof OPERATION_ERROR_CODES];

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
  ENVIRONMENT_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  STORE_ERROR_CODES,
  ABUSE_ERROR_CODES,
  AUDIT_ERROR_CODES,
  OPERATION_ERROR_CODES,
] as const;

export type KnownErrorCode =
  | ValidationErrorCode
  | AuthErrorCode
  | SecretErrorCode
  | InjectionErrorCode
  | OnboardingErrorCode
  | BootstrapErrorCode
  | EnvironmentErrorCode
  | CryptoErrorCode
  | StoreErrorCode
  | AbuseErrorCode
  | AuditErrorCode
  | OperationErrorCode
  | (string & {});
