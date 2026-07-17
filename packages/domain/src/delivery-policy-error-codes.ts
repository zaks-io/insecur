/** Delivery Risk Policy Preset and automation opt-in failures (ADR-0043, INS-88). */
export const DELIVERY_POLICY_ERROR_CODES = {
  notConfigured: "delivery_policy.not_configured",
  presetInvalid: "delivery_policy.preset_invalid",
  presetVersionUnsupported: "delivery_policy.preset_version_unsupported",
  actorInvalid: "delivery_policy.actor_invalid",
  scopeInvalid: "delivery_policy.scope_invalid",
  previewOptInRequired: "delivery_policy.preview_automation_opt_in_required",
  previewAutomationNotAllowed: "delivery_policy.preview_automation_not_allowed",
  protectedApprovalRequired: "delivery_policy.protected_approval_required",
  optInEnvironmentInvalid: "delivery_policy.opt_in_environment_invalid",
  optInNotFound: "delivery_policy.opt_in_not_found",
} as const;

export type DeliveryPolicyErrorCode =
  (typeof DELIVERY_POLICY_ERROR_CODES)[keyof typeof DELIVERY_POLICY_ERROR_CODES];
