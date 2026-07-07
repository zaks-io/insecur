import {
  mintOnboardingResourceIds,
  type OnboardingResourceIds,
  type ProvisionedWorkspace,
} from "../../onboarding/provisioning.js";
import { CreateProjectStep } from "./create-project-step.js";
import { EnrollPasskeyStep } from "./enroll-passkey-step.js";
import { NameOrganizationStep } from "./name-organization-step.js";
import type { FormStepId, ProvisionedHandoff } from "./onboarding-wizard.js";

interface WizardStepInput {
  readonly organizationName: string;
  readonly projectName: string;
  readonly resourceIds: OnboardingResourceIds;
  readonly enrollmentReturnTo: string;
  readonly enrollmentError: boolean;
  readonly passkeyEnrolled: boolean;
  readonly setOrganizationName: (value: string) => void;
  readonly setProjectName: (value: string) => void;
  readonly goTo: (step: FormStepId) => void;
  readonly onProvisioned: (handoff: ProvisionedHandoff) => void;
  readonly onContinueToHandoff: (workspace: ProvisionedWorkspace) => void;
}

function renderNameOrganizationStep(input: WizardStepInput) {
  return (
    <NameOrganizationStep
      value={input.organizationName}
      onChange={input.setOrganizationName}
      onContinue={() => {
        input.goTo("enroll-passkey");
      }}
    />
  );
}

function renderEnrollPasskeyStep(input: WizardStepInput) {
  return (
    <EnrollPasskeyStep
      returnTo={input.enrollmentReturnTo}
      enrollmentError={input.enrollmentError}
      onSkip={() => {
        input.goTo("create-project");
      }}
      {...(input.passkeyEnrolled
        ? {
            onEnrolled: () => {
              input.goTo("create-project");
            },
          }
        : {})}
    />
  );
}

function renderCreateProjectStep(input: WizardStepInput) {
  return (
    <CreateProjectStep
      organizationName={input.organizationName}
      value={input.projectName}
      onChange={input.setProjectName}
      onEditOrganization={() => {
        input.goTo("name-organization");
      }}
      resourceIds={input.resourceIds}
      onProvisioned={input.onProvisioned}
      onContinueToHandoff={input.onContinueToHandoff}
    />
  );
}

export function renderOnboardingWizardStep(step: FormStepId, input: WizardStepInput) {
  if (step === "name-organization") {
    return renderNameOrganizationStep(input);
  }
  if (step === "enroll-passkey") {
    return renderEnrollPasskeyStep(input);
  }
  return renderCreateProjectStep(input);
}

export function createOnboardingResourceIds(): OnboardingResourceIds {
  return mintOnboardingResourceIds();
}
