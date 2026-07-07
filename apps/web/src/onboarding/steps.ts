/**
 * First-run wizard step registry (docs/web-console-ux.md §First-Run Onboarding). All five
 * designed steps hold a permanent slot here so the passkey slice (INS-378) and the blind-write
 * slice (INS-379) plug in by flipping `enabled` without renumbering or reflowing the wizard.
 */
export type OnboardingStepId =
  "name-organization" | "enroll-passkey" | "create-project" | "first-secret" | "cli-handoff";

export interface OnboardingStep {
  readonly id: OnboardingStepId;
  readonly railLabel: string;
  /** Placeholder slots stay disabled until their slice lands; the rail never renders them. */
  readonly enabled: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "name-organization", railLabel: "Name your organization", enabled: true },
  // INS-378: approval passkey enrollment claims this slot.
  { id: "enroll-passkey", railLabel: "Approval passkey", enabled: false },
  { id: "create-project", railLabel: "First project", enabled: true },
  // INS-379: optional blind secret write claims this slot.
  { id: "first-secret", railLabel: "First secret", enabled: false },
  { id: "cli-handoff", railLabel: "Hand off to the CLI", enabled: true },
];

export function enabledOnboardingSteps(): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => step.enabled);
}

/** 1-based position of a step among the enabled steps, for the rail's numbering. */
export function onboardingStepNumber(id: OnboardingStepId): number {
  const index = enabledOnboardingSteps().findIndex((step) => step.id === id);
  if (index === -1) {
    throw new Error(`onboarding step ${id} is not enabled`);
  }
  return index + 1;
}
