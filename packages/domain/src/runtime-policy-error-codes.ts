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
