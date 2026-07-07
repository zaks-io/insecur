import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mintOnboardingResourceIds } from "../../onboarding/provisioning.js";
import {
  clearOnboardingWizardDraft,
  readOnboardingWizardDraft,
  writeOnboardingWizardDraft,
} from "./onboarding-wizard-draft.js";

const resourceIds = mintOnboardingResourceIds();
const sessionStore = new Map<string, string>();

describe("onboarding wizard draft", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
    });
    clearOnboardingWizardDraft();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips wizard state through sessionStorage across redirects", () => {
    writeOnboardingWizardDraft({
      step: "enroll-passkey",
      organizationName: "Acme Labs",
      projectName: "First project",
      resourceIds,
    });

    expect(readOnboardingWizardDraft()).toEqual({
      step: "enroll-passkey",
      organizationName: "Acme Labs",
      projectName: "First project",
      resourceIds,
    });
  });

  it("ignores malformed stored drafts", () => {
    sessionStorage.setItem("insecur:onboarding-wizard-draft", "{not-json");
    expect(readOnboardingWizardDraft()).toBeNull();
  });
});
