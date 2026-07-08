import type { CliProfileId, DisplayName, ResolvedTargetEcho } from "@insecur/domain";
import type { GuidedOrganizationProvisionData } from "../api/types.js";
import type { LocalInitProvisionData } from "../local/provision-local-project.js";
import { asEchoId } from "../output/target-echo.js";

function projectEcho(
  projectId: string,
  displayName: DisplayName,
  parent?: ResolvedTargetEcho,
): ResolvedTargetEcho {
  return {
    type: "project",
    id: asEchoId(projectId),
    displayName,
    ...(parent === undefined ? {} : { parent }),
  };
}

function environmentEcho(
  environmentId: string,
  projectId: string,
  displayName: DisplayName,
): ResolvedTargetEcho {
  return {
    type: "environment",
    id: asEchoId(environmentId),
    displayName,
    parent: { type: "project", id: asEchoId(projectId) },
  };
}

function cliProfileEcho(
  profileId: CliProfileId,
  profileSlug: string,
  displayName: DisplayName,
): ResolvedTargetEcho {
  return {
    type: "cli_profile",
    id: asEchoId(profileId),
    slug: profileSlug,
    displayName,
  };
}

export function buildLocalInitResolvedTargets(
  data: LocalInitProvisionData,
  profileId: CliProfileId,
  profileSlug: string,
  labels: {
    readonly project: DisplayName;
    readonly environment: DisplayName;
    readonly profile: DisplayName;
  },
): ResolvedTargetEcho[] {
  return [
    projectEcho(data.projectId, labels.project),
    environmentEcho(data.developmentEnvironmentId, data.projectId, labels.environment),
    cliProfileEcho(profileId, profileSlug, labels.profile),
  ];
}

export function buildInitResolvedTargets(
  data: GuidedOrganizationProvisionData,
  profileId: CliProfileId,
  profileSlug: string,
  labels: {
    readonly organization: DisplayName;
    readonly project: DisplayName;
    readonly environment: DisplayName;
    readonly profile: DisplayName;
  },
): ResolvedTargetEcho[] {
  const organization = {
    type: "organization" as const,
    id: asEchoId(data.organizationId),
    displayName: labels.organization,
  };
  return [
    organization,
    projectEcho(data.projectId, labels.project, organization),
    environmentEcho(data.developmentEnvironmentId, data.projectId, labels.environment),
    cliProfileEcho(profileId, profileSlug, labels.profile),
  ];
}
