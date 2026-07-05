import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CliHandoffPane } from "../components/onboarding/cli-handoff-pane.js";
import { OnboardingFrame } from "../components/onboarding/onboarding-frame.js";
import {
  OnboardingWizard,
  type ProvisionedHandoff,
} from "../components/onboarding/onboarding-wizard.js";
import { loginRedirectHref } from "../console/login-redirect.js";
import {
  decideOnboardingRoute,
  parseHandoffSearch,
  type OnboardingSearch,
} from "../onboarding/routing.js";
import type { ProvisionedWorkspace } from "../onboarding/provisioning.js";
import type { OnboardingStepId } from "../onboarding/steps.js";
import { loadConsoleSession } from "../server/console-session.js";

/**
 * The first-run onboarding wizard (INS-374, docs/web-console-ux.md §First-Run Onboarding).
 * Signed-in members with no organization land here and complete Guided Organization
 * Provisioning; `?org&project&env` re-opens the CLI handoff for a workspace they belong to.
 * Members with an organization and no handoff link are sent back to their console.
 */
export const Route = createFileRoute("/onboarding")({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    ...(typeof search.org === "string" ? { org: search.org } : {}),
    ...(typeof search.project === "string" ? { project: search.project } : {}),
    ...(typeof search.env === "string" ? { env: search.env } : {}),
  }),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps }) => {
    const session = await loadConsoleSession();
    const workspace = parseHandoffSearch(deps.search);
    if (!session.authenticated) {
      throw redirect({ href: loginRedirectHref(onboardingReturnTo(workspace)) });
    }
    const decision = decideOnboardingRoute(session.organizations, workspace);
    if (decision.kind === "redirect-console") {
      throw redirect({ href: decision.href });
    }
    return decision;
  },
  component: OnboardingPage,
});

function onboardingReturnTo(workspace: ProvisionedWorkspace | undefined): string {
  if (workspace === undefined) {
    return "/onboarding";
  }
  const params = new URLSearchParams({
    org: workspace.organizationId,
    project: workspace.projectId,
    env: workspace.environmentId,
  });
  return `/onboarding?${params.toString()}`;
}

function OnboardingPage() {
  const decision = Route.useLoaderData();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<ProvisionedHandoff>();
  const [formStep, setFormStep] = useState<OnboardingStepId>("name-organization");

  // The live wizard result wins over loader data so the receipt keeps both Display Names; a
  // reloaded handoff link recovers the organization name from the memberships read.
  const handoff = completed ?? (decision.kind === "handoff" ? decision : undefined);

  const handleProvisioned = (result: ProvisionedHandoff) => {
    setCompleted(result);
    void navigate({
      to: "/onboarding",
      search: {
        org: result.workspace.organizationId,
        project: result.workspace.projectId,
        env: result.workspace.environmentId,
      },
      replace: true,
    });
  };

  return (
    <OnboardingFrame currentStep={handoff === undefined ? formStep : "cli-handoff"}>
      {handoff === undefined ? (
        <OnboardingWizard onProvisioned={handleProvisioned} onStepChange={setFormStep} />
      ) : (
        <CliHandoffPane
          workspace={handoff.workspace}
          organizationName={handoff.organizationName}
          projectName={"projectName" in handoff ? handoff.projectName : undefined}
        />
      )}
    </OnboardingFrame>
  );
}
