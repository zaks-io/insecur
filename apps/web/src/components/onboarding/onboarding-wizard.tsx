import type { ProvisionedWorkspace } from "../../onboarding/provisioning.js";
import { renderOnboardingWizardStep } from "./onboarding-wizard-steps.js";
import type { FormStepId, ProvisionedHandoff } from "./onboarding-wizard-types.js";
import { usePersistedOnboardingWizardState } from "./use-persisted-onboarding-wizard-state.js";

export type { FormStepId, ProvisionedHandoff };

/**
 * Steps 1–4 of the first-run wizard: organization name, optional approval passkey enrollment,
 * first project provisioning (ADR-0063), then optional blind secret write (INS-379).
 */
export function OnboardingWizard({
  enrollmentReturnTo,
  enrollmentError,
  passkeyEnrolled,
  onProvisioned,
  onContinueToHandoff,
  onStepChange,
}: {
  enrollmentReturnTo: string;
  enrollmentError: boolean;
  passkeyEnrolled: boolean;
  onProvisioned: (handoff: ProvisionedHandoff) => void;
  onContinueToHandoff: (workspace: ProvisionedWorkspace) => void;
  onStepChange: (step: FormStepId) => void;
}) {
  const wizard = usePersistedOnboardingWizardState(onStepChange, onProvisioned);

  return renderOnboardingWizardStep(wizard.step, {
    organizationName: wizard.organizationName,
    projectName: wizard.projectName,
    resourceIds: wizard.resourceIds,
    provisionedHandoff: wizard.provisionedHandoff,
    enrollmentReturnTo,
    enrollmentError,
    passkeyEnrolled,
    setOrganizationName: wizard.setOrganizationName,
    setProjectName: wizard.setProjectName,
    goTo: wizard.goTo,
    onWorkspaceProvisioned: wizard.handleWorkspaceProvisioned,
    onFinishWizard: wizard.finishWizard,
    onContinueToHandoff,
  });
}
