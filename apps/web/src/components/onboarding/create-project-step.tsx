import { Button } from "@insecur/ui";
import { useState, type SyntheticEvent } from "react";
import { csrfTokenFromCookieHeader } from "../../onboarding/csrf.js";
import {
  workspaceNameError,
  type OnboardingResourceIds,
  type ProvisionOutcome,
  type ProvisionedWorkspace,
} from "../../onboarding/provisioning.js";
import { provisionErrorVoice, type WizardErrorVoice } from "../../onboarding/wizard-voice.js";
import { provisionOnboardingWorkspace } from "../../server/onboarding.js";
import type { ProvisionedHandoff } from "./onboarding-wizard.js";
import { FailureNotice } from "./failure-notice.js";
import { NameField } from "./name-field.js";
import { OrganizationRecap } from "./organization-recap.js";
import { StepPanel } from "./step-panel.js";

const ERRORS = {
  empty: "Give your project a name.",
  invalid: "Names need at least one visible character and at most 200.",
} as const;

interface CreateProjectStepProps {
  organizationName: string;
  value: string;
  onChange: (value: string) => void;
  onEditOrganization: () => void;
  resourceIds: OnboardingResourceIds;
  onProvisioned: (handoff: ProvisionedHandoff) => void;
  /** Clean-conflict path (ADR-0063): the workspace exists but this render can't vouch for its
   * Display Names, so the caller reopens the handoff from the loader's membership truth. */
  onContinueToHandoff: (workspace: ProvisionedWorkspace) => void;
}

async function submitProvisioning(data: {
  organizationName: string;
  projectName: string;
  resourceIds: OnboardingResourceIds;
}): Promise<ProvisionOutcome> {
  try {
    return await provisionOnboardingWorkspace({
      data: { csrfToken: csrfTokenFromCookieHeader(document.cookie) ?? "", ...data },
    });
  } catch {
    return { ok: false, code: "web.unexpected_response" };
  }
}

function useCreateProjectForm(props: CreateProjectStepProps) {
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<WizardErrorVoice>();
  const [submitting, setSubmitting] = useState(false);

  const mintedWorkspace = (): ProvisionedWorkspace => ({
    organizationId: props.resourceIds.organizationId,
    projectId: props.resourceIds.projectId,
    environmentId: props.resourceIds.developmentEnvironmentId,
  });

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const issue = workspaceNameError(props.value);
    if (issue !== undefined) {
      setError(ERRORS[issue]);
      return;
    }
    setError(undefined);
    setFailure(undefined);
    setSubmitting(true);
    const outcome = await submitProvisioning({
      organizationName: props.organizationName,
      projectName: props.value,
      resourceIds: props.resourceIds,
    });
    setSubmitting(false);
    if (outcome.ok) {
      props.onProvisioned({
        workspace: outcome.workspace,
        organizationName: props.organizationName.trim(),
        projectName: props.value.trim(),
      });
      return;
    }
    setFailure(provisionErrorVoice(outcome.code));
  };

  return { error, failure, submitting, submit, mintedWorkspace };
}

/**
 * Step 3: name the first Project and fire the single create-only provisioning call (ADR-0063).
 * The dev Environment rides along server-side; the IDs were minted once for this wizard session,
 * so a retried submit can never create a second workspace.
 */
export function CreateProjectStep(props: CreateProjectStepProps) {
  const form = useCreateProjectForm(props);

  return (
    <StepPanel
      title="Create your first project"
      intro="A project holds the secrets one app needs. A development environment is created with it, unprotected, ready for local work."
    >
      <OrganizationRecap
        organizationName={props.organizationName.trim()}
        onEdit={props.onEditOrganization}
      />
      <form
        onSubmit={(event) => {
          void form.submit(event);
        }}
        className="mt-5 flex flex-col gap-5"
      >
        <NameField
          id="project-name"
          label="Project name"
          placeholder="What you're building"
          value={props.value}
          onChange={props.onChange}
          error={form.error}
        />
        {form.failure === undefined ? null : (
          <FailureNotice
            failure={form.failure}
            onContinueToHandoff={() => {
              props.onContinueToHandoff(form.mintedWorkspace());
            }}
          />
        )}
        <div>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Creating…" : "Create organization and project"}
          </Button>
        </div>
      </form>
    </StepPanel>
  );
}
