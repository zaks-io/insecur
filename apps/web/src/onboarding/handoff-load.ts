import type { ConsoleEnvironment, ConsoleProject } from "../console/projects.js";
import type { ConsoleRead } from "../server/console-read.js";
import type { ProvisionedWorkspace } from "./provisioning.js";
import { verifiedHandoffNames, type VerifiedHandoffNames } from "./routing.js";

export type HandoffNamesLoad =
  | { readonly kind: "ok"; readonly names: VerifiedHandoffNames }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unverified" };

export interface HandoffNamesLoaders {
  readonly loadOrgProjects: (input: {
    data: { organizationId: string };
  }) => Promise<ConsoleRead<readonly ConsoleProject[]>>;
  readonly loadProjectEnvironments: (input: {
    data: { organizationId: string; projectId: string };
  }) => Promise<ConsoleRead<readonly ConsoleEnvironment[]>>;
}

/**
 * Resolve onboarding handoff Display Names from membership-truth reads. Backend outages retry;
 * denied or unverifiable IDs fall back to the org console without rendering unproven names.
 */
export function resolveHandoffNamesLoad(
  projects: ConsoleRead<readonly ConsoleProject[]>,
  environments: ConsoleRead<readonly ConsoleEnvironment[]>,
  workspace: ProvisionedWorkspace,
): HandoffNamesLoad {
  if (projects.kind === "unavailable" || environments.kind === "unavailable") {
    return { kind: "unavailable" };
  }
  if (projects.kind !== "ok" || environments.kind !== "ok") {
    return { kind: "unverified" };
  }
  const names = verifiedHandoffNames(projects.value, environments.value, workspace);
  return names === null ? { kind: "unverified" } : { kind: "ok", names };
}

/** Membership-truth reads for a reopened CLI handoff deep link. */
export async function loadHandoffNames(
  workspace: ProvisionedWorkspace,
  loaders: HandoffNamesLoaders,
): Promise<HandoffNamesLoad> {
  const projects = await loaders.loadOrgProjects({
    data: { organizationId: workspace.organizationId },
  });
  const environments = await loaders.loadProjectEnvironments({
    data: { organizationId: workspace.organizationId, projectId: workspace.projectId },
  });
  return resolveHandoffNamesLoad(projects, environments, workspace);
}
