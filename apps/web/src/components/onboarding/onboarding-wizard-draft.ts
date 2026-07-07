import {
  parseOnboardingResourceIds,
  type OnboardingResourceIds,
} from "../../onboarding/provisioning.js";

const STORAGE_KEY = "insecur:onboarding-wizard-draft";

export type FormStepId = "name-organization" | "enroll-passkey" | "create-project";

const FORM_STEPS = new Set<FormStepId>(["name-organization", "enroll-passkey", "create-project"]);

export interface OnboardingWizardDraft {
  readonly step: FormStepId;
  readonly organizationName: string;
  readonly projectName: string;
  readonly resourceIds: OnboardingResourceIds;
}

function parseDraftRecord(parsed: Record<string, unknown>): OnboardingWizardDraft | null {
  const resourceIds = parseOnboardingResourceIds(parsed.resourceIds);
  const step = parsed.step;
  if (
    resourceIds === null ||
    typeof step !== "string" ||
    !FORM_STEPS.has(step as FormStepId) ||
    typeof parsed.organizationName !== "string" ||
    typeof parsed.projectName !== "string"
  ) {
    return null;
  }
  return {
    step: step as FormStepId,
    organizationName: parsed.organizationName,
    projectName: parsed.projectName,
    resourceIds,
  };
}

export function readOnboardingWizardDraft(): OnboardingWizardDraft | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseDraftRecord(parsed);
  } catch {
    return null;
  }
}

export function writeOnboardingWizardDraft(draft: OnboardingWizardDraft): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearOnboardingWizardDraft(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
