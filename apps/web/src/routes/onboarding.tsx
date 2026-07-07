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
  type OnboardingRouteDecision,
  type OnboardingSearch,
  type VerifiedHandoffNames,
} from "../onboarding/routing.js";
import { loadHandoffNames } from "../onboarding/handoff-load.js";
import type { ProvisionedWorkspace } from "../onboarding/provisioning.js";
import type { OnboardingStepId } from "../onboarding/steps.js";
import { requireConsoleSession } from "../console/route-guards.js";
import { throwConsoleUnavailable } from "../console/unavailable.js";
import { loadApprovalPasskeyPosture } from "../server/approval-passkey-posture.js";
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
    ...(search.passkey === "failed" ? { passkey: "failed" as const } : {}),
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
      const passkeyPosture = await loadApprovalPasskeyPosture();
      return {
        ...decision,
        passkeyEnrolled: passkeyPosture.kind === "authenticated" && passkeyPosture.enrolled,
      };
    }
    // The receipt claims these resources exist, so the URL's project/env IDs are verified
    // against the member's own metadata reads (INS-362); an unverifiable pair falls back to
    // the console rather than rendering unproven IDs into terminal commands.
    const namesLoad = await loadHandoffNames(decision.workspace, {
      loadOrgProjects,
      loadProjectEnvironments,
    });
    if (namesLoad.kind === "unavailable") {
      throwConsoleUnavailable();
    }
    if (namesLoad.kind === "unverified") {
      throw redirect({ href: `/orgs/${decision.workspace.organizationId}` });
    }
    return { ...decision, ...namesLoad.names };
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

type OnboardingLoaderData =
  | (Extract<OnboardingRouteDecision, { kind: "wizard" }> & { passkeyEnrolled: boolean })
  | (Extract<OnboardingRouteDecision, { kind: "handoff" }> & VerifiedHandoffNames);

function resolveOnboardingHandoff(
  completed: ProvisionedHandoff | undefined,
  decision: OnboardingLoaderData,
) {
  if (completed !== undefined) {
    return { ...completed, environmentName: "Development" };
  }
  return decision.kind === "handoff" ? decision : undefined;
}

function OnboardingPage() {
  const decision = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<ProvisionedHandoff>();
  const [formStep, setFormStep] = useState<OnboardingStepId>("name-organization");
  const handoff = resolveOnboardingHandoff(completed, decision);

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
          enrollmentReturnTo="/onboarding"
          enrollmentError={search.passkey === "failed"}
          passkeyEnrolled={decision.kind === "wizard" ? decision.passkeyEnrolled : false}
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
