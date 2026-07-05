import { environmentId, organizationId, projectId } from "@insecur/domain";
import type { ConsoleOrganization } from "../console/organizations.js";
import type { ProvisionedWorkspace } from "./provisioning.js";

export interface OnboardingSearch {
  readonly org?: string;
  readonly project?: string;
  readonly env?: string;
}

/**
 * Validate the handoff deep-link search params (`/onboarding?org&project&env`). Only a complete,
 * format-valid opaque ID triple counts; anything else falls back to the plain wizard entry.
 */
export function parseHandoffSearch(search: OnboardingSearch): ProvisionedWorkspace | undefined {
  if (search.org === undefined || search.project === undefined || search.env === undefined) {
    return undefined;
  }
  if (
    !organizationId.parse(search.org).ok ||
    !projectId.parse(search.project).ok ||
    !environmentId.parse(search.env).ok
  ) {
    return undefined;
  }
  return {
    organizationId: search.org,
    projectId: search.project,
    environmentId: search.env,
  };
}

export type OnboardingRouteDecision =
  | { readonly kind: "wizard" }
  | {
      readonly kind: "handoff";
      readonly workspace: ProvisionedWorkspace;
      readonly organizationName: string;
    }
  | { readonly kind: "redirect-console"; readonly href: string };

/**
 * Where `/onboarding` sends a signed-in member. Org-less members get the wizard. Members with a
 * workspace only stay for the CLI handoff view, and only for an organization they belong to;
 * everything else returns to their console (the loader handles the unauthenticated redirect).
 */
export function decideOnboardingRoute(
  organizations: readonly ConsoleOrganization[],
  workspace: ProvisionedWorkspace | undefined,
): OnboardingRouteDecision {
  if (workspace !== undefined) {
    const membership = organizations.find(
      (organization) => organization.organizationId === workspace.organizationId,
    );
    if (membership !== undefined) {
      return { kind: "handoff", workspace, organizationName: membership.displayName };
    }
  }
  const first = organizations[0];
  if (first !== undefined) {
    return { kind: "redirect-console", href: `/orgs/${first.organizationId}` };
  }
  return { kind: "wizard" };
}
