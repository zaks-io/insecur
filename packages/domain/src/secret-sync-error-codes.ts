/** Secret Sync model validation and access failures. */
export const SECRET_SYNC_ERROR_CODES = {
  notFound: "sync.not_found",
  disabled: "sync.disabled",
  invalidBindings: "sync.invalid_bindings",
  patternBindingRejected: "sync.pattern_binding_rejected",
  secretBindingNotFound: "sync.secret_binding_not_found",
  secretBindingEnvironmentMismatch: "sync.secret_binding_environment_mismatch",
  sourceValueMissing: "sync.source_value_missing",
  invalidDestination: "sync.invalid_destination",
  resourceConflict: "sync.resource_conflict",
  connectionNotEligible: "sync.connection_not_eligible",
  displayNameInUse: "sync.display_name_in_use",
} as const;

export type SecretSyncErrorCode =
  (typeof SECRET_SYNC_ERROR_CODES)[keyof typeof SECRET_SYNC_ERROR_CODES];
