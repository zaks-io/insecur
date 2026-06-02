import type { CliProfileId, DisplayName, ResolvedTargetEcho } from "@insecur/domain";
import type { GuidedOrganizationProvisionData } from "../api/types.js";
import { asEchoId } from "../output/target-echo.js";

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
  return [
    {
      type: "organization",
      id: asEchoId(data.organizationId),
      displayName: labels.organization,
    },
    {
      type: "project",
      id: asEchoId(data.projectId),
      displayName: labels.project,
      parent: { type: "organization", id: asEchoId(data.organizationId) },
    },
    {
      type: "environment",
      id: asEchoId(data.developmentEnvironmentId),
      displayName: labels.environment,
      parent: { type: "project", id: asEchoId(data.projectId) },
    },
    {
      type: "cli_profile",
      id: asEchoId(profileId),
      slug: profileSlug,
      displayName: labels.profile,
    },
  ];
}
