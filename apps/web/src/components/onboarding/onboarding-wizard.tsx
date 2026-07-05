import { useState } from "react";
import {
  mintOnboardingResourceIds,
  type ProvisionedWorkspace,
} from "../../onboarding/provisioning.js";
import { CreateProjectStep } from "./create-project-step.js";
import { NameOrganizationStep } from "./name-organization-step.js";

export interface ProvisionedHandoff {
  readonly workspace: ProvisionedWorkspace;
  readonly organizationName: string;
  readonly projectName: string;
}

type FormStepId = "name-organization" | "create-project";

/**
 * Steps 1 and 3 of the first-run wizard: collect the two Display Names, then provision. IDs are
 * minted once per wizard session, making the create-only call idempotent across retries
 * (ADR-0063).
 */
export function OnboardingWizard({
  onProvisioned,
  onStepChange,
}: {
  onProvisioned: (handoff: ProvisionedHandoff) => void;
  onStepChange: (step: FormStepId) => void;
}) {
  const [resourceIds] = useState(mintOnboardingResourceIds);
  const [step, setStep] = useState<FormStepId>("name-organization");
  const [organizationName, setOrganizationName] = useState("");
  const [projectName, setProjectName] = useState("");

  const goTo = (next: FormStepId) => {
    setStep(next);
    onStepChange(next);
  };

  if (step === "name-organization") {
    return (
      <NameOrganizationStep
        value={organizationName}
        onChange={setOrganizationName}
        onContinue={() => {
          goTo("create-project");
        }}
      />
    );
  }

  return (
    <CreateProjectStep
      organizationName={organizationName}
      value={projectName}
      onChange={setProjectName}
      onEditOrganization={() => {
        goTo("name-organization");
      }}
      resourceIds={resourceIds}
      onProvisioned={onProvisioned}
    />
  );
}
