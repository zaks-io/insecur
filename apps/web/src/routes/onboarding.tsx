import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleRouteError } from "../components/console-route-error.js";
import { CliHandoffPane } from "../components/onboarding/cli-handoff-pane.js";
import { OnboardingFrame } from "../components/onboarding/onboarding-frame.js";
import {
  OnboardingWizard,
  type ProvisionedHandoff,
} from "../components/onboarding/onboarding-wizard.js";
import {
  decideOnboardingRoute,
  parseHandoffSearch,
  verifiedHandoffNames,
  type OnboardingSearch,
  type VerifiedHandoffNames,
} from "../onboarding/routing.js";
import type { ProvisionedWorkspace } from "../onboarding/provisioning.js";
import type { OnboardingStepId } from "../onboarding/steps.js";
import { requireConsoleSession } from "../console/route-guards.js";
import { loadOrgProjects, loadProjectEnvironments } from "../server/console-projects.js";
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
    const session = requireConsoleSession(
      await loadConsoleSession(),
      onboardingReturnTo(parseHandoffSearch(deps.search)),
    );
    const workspace = parseHandoffSearch(deps.search);
    const decision = decideOnboardingRoute(session.organizations, workspace);
    if (decision.kind === "redirect-console") {
      throw redirect({ href: decision.href });
    }
    if (decision.kind !== "handoff") {
      return decision;
    }
    // The receipt claims these resources exist, so the URL's project/env IDs are verified
    // against the member's own metadata reads (INS-362); an unverifiable pair falls back to
    // the console rather than rendering unproven IDs into terminal commands.
    const names = await loadHandoffNames(decision.workspace);
    if (names === null) {
      throw redirect({ href: `/orgs/${decision.workspace.organizationId}` });
    }
    return { ...decision, ...names };
  },
  component: OnboardingPage,
  errorComponent: ConsoleRouteError,
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

async function loadHandoffNames(
  workspace: ProvisionedWorkspace,
): Promise<VerifiedHandoffNames | null> {
  const projects = await loadOrgProjects({
    data: { organizationId: workspace.organizationId },
  });
  if (projects.kind !== "ok") {
    return null;
  }
  const environments = await loadProjectEnvironments({
    data: { organizationId: workspace.organizationId, projectId: workspace.projectId },
  });
  if (environments.kind !== "ok") {
    return null;
  }
  return verifiedHandoffNames(projects.value, environments.value, workspace);
}

function OnboardingPage() {
  const decision = Route.useLoaderData();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<ProvisionedHandoff>();
  const [formStep, setFormStep] = useState<OnboardingStepId>("name-organization");

  // The live wizard result wins over loader data; a reloaded handoff link recovers every
  // Display Name from the membership-truth reads instead. The auto-created dev Environment
  // keeps its provisioning default Display Name, so the live flow can state it.
  const handoff =
    completed !== undefined
      ? { ...completed, environmentName: "Development" }
      : decision.kind === "handoff"
        ? decision
        : undefined;

  const navigateToHandoff = (workspace: ProvisionedWorkspace) => {
    void navigate({
      to: "/onboarding",
      search: {
        org: workspace.organizationId,
        project: workspace.projectId,
        env: workspace.environmentId,
      },
      replace: true,
    });
  };

  const handleProvisioned = (result: ProvisionedHandoff) => {
    setCompleted(result);
    navigateToHandoff(result.workspace);
  };

  return (
    <OnboardingFrame currentStep={handoff === undefined ? formStep : "cli-handoff"}>
      {handoff === undefined ? (
        <OnboardingWizard
          onProvisioned={handleProvisioned}
          onContinueToHandoff={navigateToHandoff}
          onStepChange={setFormStep}
        />
      ) : (
        <CliHandoffPane
          workspace={handoff.workspace}
          organizationName={handoff.organizationName}
          projectName={handoff.projectName}
          environmentName={handoff.environmentName}
        />
      )}
    </OnboardingFrame>
  );
}
