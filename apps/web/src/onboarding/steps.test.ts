import { describe, expect, it } from "vitest";
import { enabledOnboardingSteps, ONBOARDING_STEPS, onboardingStepNumber } from "./steps.js";

describe("onboarding step registry", () => {
  it("keeps all five designed slots so INS-378/INS-379 plug in without reflow", () => {
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      "name-organization",
      "enroll-passkey",
      "create-project",
      "first-secret",
      "cli-handoff",
    ]);
  });

  it("renders only the enabled steps until the placeholder slices land", () => {
    expect(enabledOnboardingSteps().map((step) => step.id)).toEqual([
      "name-organization",
      "enroll-passkey",
      "create-project",
      "cli-handoff",
    ]);
  });

  it("numbers steps by enabled position", () => {
    expect(onboardingStepNumber("name-organization")).toBe(1);
    expect(onboardingStepNumber("enroll-passkey")).toBe(2);
    expect(onboardingStepNumber("create-project")).toBe(3);
    expect(onboardingStepNumber("cli-handoff")).toBe(4);
  });

  it("fails loud when asked to number a disabled placeholder slot", () => {
    expect(() => onboardingStepNumber("first-secret")).toThrow(/not enabled/u);
  });
});
