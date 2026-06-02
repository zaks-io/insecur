import { organizationId, teamId } from "@insecur/domain";
import type { OperatorOrganizationResourceIds } from "./operator-organization-types.js";

export function mintOperatorOrganizationIds(
  resourceIds: OperatorOrganizationResourceIds | undefined,
): OperatorOrganizationResourceIds {
  if (resourceIds !== undefined) {
    return resourceIds;
  }
  return {
    organizationId: organizationId.generate(),
    defaultTeamId: teamId.generate(),
  };
}
