import {
  mintOnboardingResourceIds,
  type OnboardingResourceIds,
  type ProvisionedWorkspace,
} from "../../onboarding/provisioning.js";
import { CreateProjectStep } from "./create-project-step.js";
import { EnrollPasskeyStep } from "./enroll-passkey-step.js";
import { FirstSecretStep } from "./first-secret-step.js";
import { NameOrganizationStep } from "./name-organization-step.js";
import type { FormStepId, ProvisionedHandoff } from "./onboarding-wizard-types.js";

interface WizardStepInput {
  readonly organizationName: string;
  readonly projectName: string;
  readonly resourceIds: OnboardingResourceIds;
  readonly provisionedHandoff: ProvisionedHandoff | undefined;
  readonly enrollmentReturnTo: string;
  readonly enrollmentError: boolean;
  readonly passkeyEnrolled: boolean;
  readonly setOrganizationName: (value: string) => void;
  readonly setProjectName: (value: string) => void;
  readonly goTo: (step: FormStepId) => void;
  readonly onWorkspaceProvisioned: (handoff: ProvisionedHandoff) => void;
  readonly onFinishWizard: (handoff: ProvisionedHandoff) => void;
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
      onProvisioned={input.onWorkspaceProvisioned}
      onContinueToHandoff={input.onContinueToHandoff}
    />
  );
}

function renderFirstSecretStep(input: WizardStepInput) {
  const handoff = input.provisionedHandoff;
  if (handoff === undefined) {
    return null;
  }
  return (
    <FirstSecretStep
      workspace={handoff.workspace}
      onSkip={() => {
        input.onFinishWizard(handoff);
      }}
      onWritten={() => {
        input.onFinishWizard(handoff);
      }}
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
  if (step === "first-secret") {
    return renderFirstSecretStep(input);
  }
  return renderCreateProjectStep(input);
}

export function createOnboardingResourceIds(): OnboardingResourceIds {
  return mintOnboardingResourceIds();
}
