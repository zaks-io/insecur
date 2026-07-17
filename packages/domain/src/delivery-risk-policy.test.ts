import { describe, expect, it } from "vitest";

import {
  CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION,
  DEFAULT_DELIVERY_RISK_POLICY_PRESET,
  DELIVERY_RISK_POLICY_PRESET_TEMPLATES,
  DELIVERY_RISK_POLICY_PRESETS,
  isDeliveryRiskPolicyPreset,
  isRiskBroadeningDeliveryPolicyChange,
  isSupportedDeliveryRiskPolicyPresetVersion,
  PREVIEW_AUTOMATION_BEHAVIORS,
} from "./delivery-risk-policy.js";

describe("delivery risk policy presets (ADR-0043)", () => {
  it("names exactly the three V1 presets with stable codes", () => {
    expect(Object.values(DELIVERY_RISK_POLICY_PRESETS)).toEqual([
      "strict",
      "balanced",
      "automation_friendly",
    ]);
    for (const preset of Object.values(DELIVERY_RISK_POLICY_PRESETS)) {
      expect(isDeliveryRiskPolicyPreset(preset)).toBe(true);
    }
    expect(isDeliveryRiskPolicyPreset("custom")).toBe(false);
    expect(isDeliveryRiskPolicyPreset("")).toBe(false);
  });

  it("defaults newly provisioned scopes to balanced", () => {
    expect(DEFAULT_DELIVERY_RISK_POLICY_PRESET).toBe(DELIVERY_RISK_POLICY_PRESETS.balanced);
  });

  it("supports only the current preset template version and fails closed on others", () => {
    expect(
      isSupportedDeliveryRiskPolicyPresetVersion(CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION),
    ).toBe(true);
    expect(isSupportedDeliveryRiskPolicyPresetVersion(0)).toBe(false);
    expect(
      isSupportedDeliveryRiskPolicyPresetVersion(CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION + 1),
    ).toBe(false);
    expect(isSupportedDeliveryRiskPolicyPresetVersion(Number.NaN)).toBe(false);
  });

  it("keeps non-protected development automation available under every preset", () => {
    for (const template of Object.values(DELIVERY_RISK_POLICY_PRESET_TEMPLATES)) {
      expect(template.developmentAutomation).toBe("default_on");
      expect(template.presetVersion).toBe(CURRENT_DELIVERY_RISK_POLICY_PRESET_VERSION);
    }
  });

  it("maps preview automation behavior per preset", () => {
    expect(
      DELIVERY_RISK_POLICY_PRESET_TEMPLATES[DELIVERY_RISK_POLICY_PRESETS.strict].previewAutomation,
    ).toBe(PREVIEW_AUTOMATION_BEHAVIORS.humanReviewRequired);
    expect(
      DELIVERY_RISK_POLICY_PRESET_TEMPLATES[DELIVERY_RISK_POLICY_PRESETS.balanced]
        .previewAutomation,
    ).toBe(PREVIEW_AUTOMATION_BEHAVIORS.optIn);
    expect(
      DELIVERY_RISK_POLICY_PRESET_TEMPLATES[DELIVERY_RISK_POLICY_PRESETS.automationFriendly]
        .previewAutomation,
    ).toBe(PREVIEW_AUTOMATION_BEHAVIORS.defaultOn);
  });

  it("classifies loosening changes as risk-broadening and tightening as not", () => {
    const { strict, balanced, automationFriendly } = DELIVERY_RISK_POLICY_PRESETS;

    expect(isRiskBroadeningDeliveryPolicyChange(strict, balanced)).toBe(true);
    expect(isRiskBroadeningDeliveryPolicyChange(strict, automationFriendly)).toBe(true);
    expect(isRiskBroadeningDeliveryPolicyChange(balanced, automationFriendly)).toBe(true);

    expect(isRiskBroadeningDeliveryPolicyChange(balanced, strict)).toBe(false);
    expect(isRiskBroadeningDeliveryPolicyChange(automationFriendly, balanced)).toBe(false);
    expect(isRiskBroadeningDeliveryPolicyChange(automationFriendly, strict)).toBe(false);

    for (const preset of Object.values(DELIVERY_RISK_POLICY_PRESETS)) {
      expect(isRiskBroadeningDeliveryPolicyChange(preset, preset)).toBe(false);
    }
  });
});
