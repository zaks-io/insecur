import { useEffect, useState } from "react";
import type { OnboardingResourceIds } from "../../onboarding/provisioning.js";
import type { FormStepId } from "./onboarding-wizard-draft.js";
import {
  clearOnboardingWizardDraft,
  readOnboardingWizardDraft,
  writeOnboardingWizardDraft,
} from "./onboarding-wizard-draft.js";
import { createOnboardingResourceIds } from "./onboarding-wizard-steps.js";
import type { ProvisionedHandoff } from "./onboarding-wizard-types.js";

interface PersistedWizardState {
  readonly step: FormStepId;
  readonly organizationName: string;
  readonly projectName: string;
  readonly resourceIds: OnboardingResourceIds;
  readonly setOrganizationName: (value: string) => void;
  readonly setProjectName: (value: string) => void;
  readonly goTo: (step: FormStepId) => void;
  readonly handleProvisioned: (handoff: ProvisionedHandoff) => void;
}

export function usePersistedOnboardingWizardState(
  onStepChange: (step: FormStepId) => void,
  onProvisioned: (handoff: ProvisionedHandoff) => void,
): PersistedWizardState {
  const [hydrated, setHydrated] = useState(false);
  const [resourceIds, setResourceIds] = useState(createOnboardingResourceIds);
  const [step, setStep] = useState<FormStepId>("name-organization");
  const [organizationName, setOrganizationName] = useState("");
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    const draft = readOnboardingWizardDraft();
    if (draft !== null) {
      setStep(draft.step);
      setOrganizationName(draft.organizationName);
      setProjectName(draft.projectName);
      setResourceIds(() => draft.resourceIds);
      onStepChange(draft.step);
    }
    setHydrated(true);
  }, [onStepChange]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writeOnboardingWizardDraft({
      step,
      organizationName,
      projectName,
      resourceIds,
    });
  }, [hydrated, step, organizationName, projectName, resourceIds]);

  const goTo = (next: FormStepId) => {
    setStep(next);
    onStepChange(next);
  };

  const handleProvisioned = (handoff: ProvisionedHandoff) => {
    clearOnboardingWizardDraft();
    onProvisioned(handoff);
  };

  return {
    step,
    organizationName,
    projectName,
    resourceIds,
    setOrganizationName,
    setProjectName,
    goTo,
    handleProvisioned,
  };
}
