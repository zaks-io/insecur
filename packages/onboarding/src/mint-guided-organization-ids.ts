import { environmentId, membershipId, organizationId, projectId, teamId } from "@insecur/domain";
import type { ProvisionGuidedOrganizationResourceIds } from "./provision-guided-organization-types.js";
import type { GuidedOrganizationResourceIds } from "./guided-organization-store.js";

export function toStoreResourceIds(
  ids: ProvisionGuidedOrganizationResourceIds,
): GuidedOrganizationResourceIds {
  return {
    organizationId: ids.organizationId,
    defaultTeamId: ids.defaultTeamId,
    ownerMembershipId: ids.ownerMembershipId,
    projectId: ids.projectId,
    developmentEnvironmentId: ids.developmentEnvironmentId,
  };
}

export function mintGuidedOrganizationIds(
  resourceIds: ProvisionGuidedOrganizationResourceIds | undefined,
): GuidedOrganizationResourceIds {
  if (resourceIds !== undefined) {
    return toStoreResourceIds(resourceIds);
  }
  return {
    organizationId: organizationId.generate(),
    defaultTeamId: teamId.generate(),
    ownerMembershipId: membershipId.generate(),
    projectId: projectId.generate(),
    developmentEnvironmentId: environmentId.generate(),
  };
}
