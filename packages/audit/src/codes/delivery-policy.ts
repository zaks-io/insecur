/** Delivery Risk Policy Preset and Preview Automation Opt-In events (ADR-0043, INS-88). */
export const DELIVERY_POLICY_AUDIT_EVENT_CODES = {
  deliveryPolicyPresetSelected: "delivery_policy.preset_selected",
  deliveryPolicyPresetSelectionDenied: "delivery_policy.preset_selection_denied",
  deliveryPolicyPreviewOptInEnabled: "delivery_policy.preview_opt_in_enabled",
  deliveryPolicyPreviewOptInEnableDenied: "delivery_policy.preview_opt_in_enable_denied",
  deliveryPolicyPreviewOptInRevoked: "delivery_policy.preview_opt_in_revoked",
  deliveryPolicyPreviewOptInRevokeDenied: "delivery_policy.preview_opt_in_revoke_denied",
  deliveryPolicyAutomationAuthorized: "delivery_policy.automation_authorized",
  deliveryPolicyAutomationDenied: "delivery_policy.automation_denied",
} as const;
