import type { ProvisionGuidedOrganizationResourceIds } from "./provision-guided-organization-types.js";
import type { GuidedOrganizationResourceIds } from "./guided-organization-store.js";
import {
  generateEnvironmentId,
  generateMembershipId,
  generateOrganizationId,
  generateProjectId,
  generateTeamId,
} from "./generate-resource-id.js";

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
    organizationId: generateOrganizationId(),
    defaultTeamId: generateTeamId(),
    ownerMembershipId: generateMembershipId(),
    projectId: generateProjectId(),
    developmentEnvironmentId: generateEnvironmentId(),
  };
}
