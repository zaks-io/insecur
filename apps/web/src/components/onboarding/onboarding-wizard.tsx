import { useState } from "react";
import type { ProvisionedWorkspace } from "../../onboarding/provisioning.js";
import {
  createOnboardingResourceIds,
  renderOnboardingWizardStep,
} from "./onboarding-wizard-steps.js";

export interface ProvisionedHandoff {
  readonly workspace: ProvisionedWorkspace;
  readonly organizationName: string;
  readonly projectName: string;
}

export type FormStepId = "name-organization" | "enroll-passkey" | "create-project";

/**
 * Steps 1–3 of the first-run wizard: organization name, optional approval passkey enrollment,
 * then first project provisioning (ADR-0063).
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
  const [resourceIds] = useState(createOnboardingResourceIds);
  const [step, setStep] = useState<FormStepId>("name-organization");
  const [organizationName, setOrganizationName] = useState("");
  const [projectName, setProjectName] = useState("");

  const goTo = (next: FormStepId) => {
    setStep(next);
    onStepChange(next);
  };

  return renderOnboardingWizardStep(step, {
    organizationName,
    projectName,
    resourceIds,
    enrollmentReturnTo,
    enrollmentError,
    passkeyEnrolled,
    setOrganizationName,
    setProjectName,
    goTo,
    onProvisioned,
    onContinueToHandoff,
  });
}
