/**
 * Delivery Risk Policy Presets (ADR-0043, INS-88).
 *
 * V1 exposes three named presets backed by versioned policy templates. The preset
 * decides only non-protected automation authority; Protected Environments always
 * require protected delivery approval evidence regardless of preset (INS-87).
 */

/** User-facing preset identifiers, stored as stable lowercase codes. */
export const DELIVERY_RISK_POLICY_PRESETS = {
  strict: "strict",
  balanced: "balanced",
  automationFriendly: "automation_friendly",
} as const;

export type DeliveryRiskPolicyPreset =
  (typeof DELIVERY_RISK_POLICY_PRESETS)[keyof typeof DELIVERY_RISK_POLICY_PRESETS];

const DELIVERY_RISK_POLICY_PRESET_SET = new Set<string>(
  Object.values(DELIVERY_RISK_POLICY_PRESETS),
);

export function isDeliveryRiskPolicyPreset(value: string): value is DeliveryRiskPolicyPreset {
  return DELIVERY_RISK_POLICY_PRESET_SET.has(value);
}

/** Default for newly provisioned Organizations and Projects (ADR-0043). */
export const DEFAULT_DELIVERY_RISK_POLICY_PRESET = DELIVERY_RISK_POLICY_PRESETS.balanced;

/** The preset template version this build understands and writes. */
export const CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION = 1;

const SUPPORTED_DELIVERY_RISK_POLICY_PRESET_VERSIONS: ReadonlySet<number> = new Set([
  CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION,
]);

/** Fail closed on unknown template versions: a newer/unknown policy must never widen automation. */
export function isSupportedDeliveryRiskPolicyPresetVersion(version: number): boolean {
  return SUPPORTED_DELIVERY_RISK_POLICY_PRESET_VERSIONS.has(version);
}

/** How a preset treats automation against non-protected preview Environments. */
export const PREVIEW_AUTOMATION_BEHAVIORS = {
  /** Preview delivery requires human review; opt-in records grant nothing (Strict). */
  humanReviewRequired: "human_review_required",
  /** Preview automation only after explicit per-Environment Preview Automation Opt-In (Balanced). */
  optIn: "opt_in",
  /** Preview Automation Authority by default for in-scope preview Environments (Automation-Friendly). */
  defaultOn: "default_on",
} as const;

export type PreviewAutomationBehavior =
  (typeof PREVIEW_AUTOMATION_BEHAVIORS)[keyof typeof PREVIEW_AUTOMATION_BEHAVIORS];

export interface DeliveryRiskPolicyPresetTemplate {
  readonly presetVersion: number;
  /** Non-protected development automation stays available under every preset (ADR-0043). */
  readonly developmentAutomation: "default_on";
  readonly previewAutomation: PreviewAutomationBehavior;
}

/** Versioned preset templates (version 1). */
export const DELIVERY_RISK_POLICY_PRESET_TEMPLATES: Readonly<
  Record<DeliveryRiskPolicyPreset, DeliveryRiskPolicyPresetTemplate>
> = {
  [DELIVERY_RISK_POLICY_PRESETS.strict]: {
    presetVersion: CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION,
    developmentAutomation: "default_on",
    previewAutomation: PREVIEW_AUTOMATION_BEHAVIORS.humanReviewRequired,
  },
  [DELIVERY_RISK_POLICY_PRESETS.balanced]: {
    presetVersion: CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION,
    developmentAutomation: "default_on",
    previewAutomation: PREVIEW_AUTOMATION_BEHAVIORS.optIn,
  },
  [DELIVERY_RISK_POLICY_PRESETS.automationFriendly]: {
    presetVersion: CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION,
    developmentAutomation: "default_on",
    previewAutomation: PREVIEW_AUTOMATION_BEHAVIORS.defaultOn,
  },
};

const PRESET_RISK_ORDER: Readonly<Record<DeliveryRiskPolicyPreset, number>> = {
  [DELIVERY_RISK_POLICY_PRESETS.strict]: 0,
  [DELIVERY_RISK_POLICY_PRESETS.balanced]: 1,
  [DELIVERY_RISK_POLICY_PRESETS.automationFriendly]: 2,
};

/**
 * A Risk-Broadening Delivery Change (ADR-0043) loosens automation posture and requires the
 * Human Approval Surface plus a High-Assurance Challenge. Tightening or same-level changes do not.
 */
export function isRiskBroadeningDeliveryPolicyChange(
  fromPreset: DeliveryRiskPolicyPreset,
  toPreset: DeliveryRiskPolicyPreset,
): boolean {
  return PRESET_RISK_ORDER[toPreset] > PRESET_RISK_ORDER[fromPreset];
}
