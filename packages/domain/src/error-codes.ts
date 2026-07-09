/**
 * Stable dotted error codes shared across packages.
 * Extend per-package catalogs in later slices; domain holds cross-cutting validation codes.
 */
import { SECRET_SYNC_ERROR_CODES, type SecretSyncErrorCode } from "./secret-sync-error-codes.js";

export { SECRET_SYNC_ERROR_CODES, type SecretSyncErrorCode } from "./secret-sync-error-codes.js";

export const VALIDATION_ERROR_CODES = {
  invalidOpaqueResourceId: "validation.invalid_opaque_resource_id",
  invalidDisplayName: "validation.invalid_display_name",
  displayNameEmpty: "validation.display_name_empty",
  invalidVariableKey: "validation.invalid_variable_key",
  invalidCommandInput: "validation.invalid_command_input",
  invalidFeedbackKind: "validation.invalid_feedback_kind",
  invalidFeedbackNoteCode: "validation.invalid_feedback_note_code",
  feedbackAssociationRequired: "validation.feedback_association_required",
  feedbackAssociationNotFound: "validation.feedback_association_not_found",
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
  deployKeyInvalid: "auth.deploy_key_invalid",
  deployKeyDisabled: "auth.deploy_key_disabled",
  deployKeyWrongEnvironment: "auth.deploy_key_wrong_environment",
  deployKeyOverbroadScope: "auth.deploy_key_overbroad_scope",
  deviceAuthorizationExpired: "auth.device_authorization_expired",
  deviceAuthorizationDenied: "auth.device_authorization_denied",
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

/** Runtime Injection Policy metadata validation and access failures. */
export const RUNTIME_POLICY_ERROR_CODES = {
  notFound: "runtime_policy.not_found",
  displayNameInUse: "runtime_policy.display_name_in_use",
  invalidBindings: "runtime_policy.invalid_bindings",
  patternBindingRejected: "runtime_policy.pattern_binding_rejected",
  secretBindingNotFound: "runtime_policy.secret_binding_not_found",
  secretBindingEnvironmentMismatch: "runtime_policy.secret_binding_environment_mismatch",
  versionImmutable: "runtime_policy.version_immutable",
  protectedUseBlocked: "runtime_policy.protected_use_blocked",
  disabled: "runtime_policy.disabled",
} as const;

export type RuntimePolicyErrorCode =
  (typeof RUNTIME_POLICY_ERROR_CODES)[keyof typeof RUNTIME_POLICY_ERROR_CODES];

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
  nonProtectedEnvironment: "environment.non_protected_environment",
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

/** Storage Security Gate production delivery denial codes. */
export const STORAGE_GATE_ERROR_CODES = {
  gateBlocked: "storage.gate_blocked",
  gateUnknown: "storage.gate_unknown",
} as const;

export type StorageGateErrorCode =
  (typeof STORAGE_GATE_ERROR_CODES)[keyof typeof STORAGE_GATE_ERROR_CODES];

/** Public-edge abuse controls (rate limiting). */
export const ABUSE_ERROR_CODES = {
  rateLimited: "abuse.rate_limited",
} as const;

export type AbuseErrorCode = (typeof ABUSE_ERROR_CODES)[keyof typeof ABUSE_ERROR_CODES];

/** Audit event writer validation failures. */
export const AUDIT_ERROR_CODES = {
  eventInvalid: "audit.event_invalid",
  exportEntryLimitExceeded: "audit.export_entry_limit_exceeded",
} as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[keyof typeof AUDIT_ERROR_CODES];

/** High-Assurance Challenge bounded operation evidence failures. */
export const HIGH_ASSURANCE_ERROR_CODES = {
  evidenceMissing: "high_assurance.evidence_missing",
  evidenceExpired: "high_assurance.evidence_expired",
  operationMismatch: "high_assurance.operation_mismatch",
  actorMismatch: "high_assurance.actor_mismatch",
  alreadyConsumed: "high_assurance.already_consumed",
  clearingDenied: "high_assurance.clearing_denied",
  sessionAssuranceFailed: "high_assurance.session_assurance_failed",
  invalidRiskReason: "high_assurance.invalid_risk_reason",
} as const;

export type HighAssuranceErrorCode =
  (typeof HIGH_ASSURANCE_ERROR_CODES)[keyof typeof HIGH_ASSURANCE_ERROR_CODES];

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
  waitTimeout: "operation.wait_timeout",
  targetBusy: "sync.target_busy",
  staleFencingToken: "operation.stale_fencing_token",
  leaseNotHeld: "operation.lease_not_held",
  leaseRequired: "operation.lease_required",
} as const;

export type OperationErrorCode = (typeof OPERATION_ERROR_CODES)[keyof typeof OPERATION_ERROR_CODES];

/** App Connection metadata and sync eligibility failures. */
export const APP_CONNECTION_ERROR_CODES = {
  notFound: "connection.not_found",
  resourceConflict: "connection.resource_conflict",
  disconnected: "connection.disconnected",
  reauthorizationRequired: "connection.reauthorization_required",
  pendingSetup: "connection.pending_setup",
  providerRegistrationMissing: "connection.provider_registration_missing",
  credentialMissing: "connection.credential_missing",
  validationFailed: "connection.validation_failed",
  boundaryMismatch: "connection.boundary_mismatch",
  invalidConnectionMethod: "connection.invalid_connection_method",
} as const;

export type AppConnectionErrorCode =
  (typeof APP_CONNECTION_ERROR_CODES)[keyof typeof APP_CONNECTION_ERROR_CODES];

/** Provider App Registration metadata failures. */
export const PROVIDER_APP_REGISTRATION_ERROR_CODES = {
  notFound: "provider_app_registration.not_found",
  notConfigured: "provider_app_registration.not_configured",
  alreadyExists: "provider_app_registration.already_exists",
} as const;

export type ProviderAppRegistrationErrorCode =
  (typeof PROVIDER_APP_REGISTRATION_ERROR_CODES)[keyof typeof PROVIDER_APP_REGISTRATION_ERROR_CODES];

/** Secret Import failures (preflight client-side; create-only write server-enforced). */
export const IMPORT_ERROR_CODES = {
  unsupportedEnvironment: "import.unsupported_environment",
  existingSecret: "import.existing_secret",
  parseError: "import.parse_error",
  duplicateVariableKey: "import.duplicate_variable_key",
} as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

/** Client-side CLI resolution and selector failures. */
export const CLI_ERROR_CODES = {
  profileNotFound: "cli.profile_not_found",
  displayNameNotFound: "cli.display_name_not_found",
  displayNameAmbiguous: "cli.display_name_ambiguous",
  parentScopeUnresolved: "cli.parent_scope_unresolved",
  destructiveIdRequired: "cli.destructive_id_required",
  profileSlugInUse: "cli.profile_slug_in_use",
  invalidProfileSlug: "validation.invalid_profile_slug",
  scopedSelectorNotFound: "cli.scoped_selector_not_found",
  validationError: "cli.validation_error",
  unexpectedError: "cli.unexpected_error",
} as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

/** Local Mode client-side capability ceiling failures. */
export const LOCAL_ERROR_CODES = {
  cloudFeatureUnavailable: "local.cloud_feature_unavailable",
  valueMissingOnMachine: "local.value_missing_on_machine",
} as const;

export type LocalErrorCode = (typeof LOCAL_ERROR_CODES)[keyof typeof LOCAL_ERROR_CODES];

/** Webhook subscription and event notification delivery errors (INS-453). */
export const NOTIFICATION_ERROR_CODES = {
  invalidEventCode: "notification.invalid_event_code",
  subscriptionNotFound: "notification.subscription_not_found",
  deliveryFailed: "notification.delivery_failed",
  signingSecretMissing: "notification.signing_secret_missing",
} as const;

export type NotificationErrorCode =
  (typeof NOTIFICATION_ERROR_CODES)[keyof typeof NOTIFICATION_ERROR_CODES];

/** Protected Change Orchestrator state machine failures (INS-82). */
export const PROTECTED_CHANGE_ERROR_CODES = {
  notFound: "protected_change.not_found",
  invalidTransition: "protected_change.invalid_transition",
  terminalState: "protected_change.terminal_state",
  activeChangeExists: "protected_change.active_change_exists",
  missingEvidence: "protected_change.missing_evidence",
  requesterMismatch: "protected_change.requester_mismatch",
  nonProtectedEnvironment: "protected_change.non_protected_environment",
} as const;

export type ProtectedChangeErrorCode =
  (typeof PROTECTED_CHANGE_ERROR_CODES)[keyof typeof PROTECTED_CHANGE_ERROR_CODES];

/** Approval request lifecycle failures (INS-84, INS-85). */
export const APPROVAL_ERROR_CODES = {
  reviewStale: "approval.review_stale",
  requestNotFound: "approval.request_not_found",
  requestNotPending: "approval.request_not_pending",
  invalidDraftSelection: "approval.invalid_draft_selection",
  wildcardSelectionRejected: "approval.wildcard_selection_rejected",
  promotionChangeSetImmutable: "approval.promotion_change_set_immutable",
  rollbackTargetNotEligible: "approval.rollback_target_not_eligible",
  draftVersionNotDiscardable: "approval.draft_version_not_discardable",
} as const;

export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[keyof typeof APPROVAL_ERROR_CODES];

/**
 * Every `*_ERROR_CODES` catalog in this module. Append new catalogs here and to
 * `KnownErrorCode` so `known-error-code-catalog.ts` lockstep coverage cannot miss them.
 */
export const ALL_ERROR_CODE_CATALOGS = [
  VALIDATION_ERROR_CODES,
  AUTH_ERROR_CODES,
  SECRET_ERROR_CODES,
  INJECTION_ERROR_CODES,
  RUNTIME_POLICY_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  ENVIRONMENT_ERROR_CODES,
  CRYPTO_ERROR_CODES,
  STORE_ERROR_CODES,
  STORAGE_GATE_ERROR_CODES,
  ABUSE_ERROR_CODES,
  AUDIT_ERROR_CODES,
  HIGH_ASSURANCE_ERROR_CODES,
  OPERATION_ERROR_CODES,
  APP_CONNECTION_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  PROVIDER_APP_REGISTRATION_ERROR_CODES,
  IMPORT_ERROR_CODES,
  CLI_ERROR_CODES,
  LOCAL_ERROR_CODES,
  NOTIFICATION_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  APPROVAL_ERROR_CODES,
] as const;

export type KnownErrorCode =
  | ValidationErrorCode
  | AuthErrorCode
  | SecretErrorCode
  | InjectionErrorCode
  | RuntimePolicyErrorCode
  | OnboardingErrorCode
  | BootstrapErrorCode
  | EnvironmentErrorCode
  | CryptoErrorCode
  | StoreErrorCode
  | StorageGateErrorCode
  | AbuseErrorCode
  | AuditErrorCode
  | HighAssuranceErrorCode
  | OperationErrorCode
  | AppConnectionErrorCode
  | SecretSyncErrorCode
  | ProviderAppRegistrationErrorCode
  | ImportErrorCode
  | CliErrorCode
  | LocalErrorCode
  | NotificationErrorCode
  | ProtectedChangeErrorCode
  | ApprovalErrorCode
  | (string & {});
