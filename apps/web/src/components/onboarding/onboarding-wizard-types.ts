import type { ProvisionedWorkspace } from "../../onboarding/provisioning.js";

export type { FormStepId } from "./onboarding-wizard-draft.js";

export interface ProvisionedHandoff {
  readonly workspace: ProvisionedWorkspace;
  readonly organizationName: string;
  readonly projectName: string;
}
