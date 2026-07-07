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
  readonly provisionedHandoff: ProvisionedHandoff | undefined;
  readonly setOrganizationName: (value: string) => void;
  readonly setProjectName: (value: string) => void;
  readonly goTo: (step: FormStepId) => void;
  readonly handleWorkspaceProvisioned: (handoff: ProvisionedHandoff) => void;
  readonly finishWizard: (handoff: ProvisionedHandoff) => void;
}

function useHydrateWizardDraft(onStepChange: (step: FormStepId) => void) {
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

  return {
    hydrated,
    step,
    setStep,
    organizationName,
    setOrganizationName,
    projectName,
    setProjectName,
    resourceIds,
  };
}

export function usePersistedOnboardingWizardState(
  onStepChange: (step: FormStepId) => void,
  onProvisioned: (handoff: ProvisionedHandoff) => void,
): PersistedWizardState {
  const draft = useHydrateWizardDraft(onStepChange);
  const [provisionedHandoff, setProvisionedHandoff] = useState<ProvisionedHandoff>();

  useEffect(() => {
    if (!draft.hydrated) {
      return;
    }
    writeOnboardingWizardDraft({
      step: draft.step,
      organizationName: draft.organizationName,
      projectName: draft.projectName,
      resourceIds: draft.resourceIds,
    });
  }, [draft.hydrated, draft.step, draft.organizationName, draft.projectName, draft.resourceIds]);

  const goTo = (next: FormStepId) => {
    draft.setStep(next);
    onStepChange(next);
  };

  const handleWorkspaceProvisioned = (handoff: ProvisionedHandoff) => {
    setProvisionedHandoff(handoff);
    goTo("first-secret");
  };

  const finishWizard = (handoff: ProvisionedHandoff) => {
    clearOnboardingWizardDraft();
    onProvisioned(handoff);
  };

  return {
    step: draft.step,
    organizationName: draft.organizationName,
    projectName: draft.projectName,
    resourceIds: draft.resourceIds,
    provisionedHandoff,
    setOrganizationName: draft.setOrganizationName,
    setProjectName: draft.setProjectName,
    goTo,
    handleWorkspaceProvisioned,
    finishWizard,
  };
}
