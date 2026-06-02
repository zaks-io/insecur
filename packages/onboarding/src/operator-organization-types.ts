import type { DisplayName, OrganizationId, TeamId, UserId } from "@insecur/domain";
import type { AuditRequestRef } from "@insecur/audit";

export interface OperatorOrganizationResourceIds {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
}

export interface CreateOperatorOrganizationInput {
  instanceId: string;
  operatorUserId: UserId;
  organizationDisplayName?: DisplayName;
  teamDisplayName?: DisplayName;
  resourceIds?: OperatorOrganizationResourceIds;
  request?: AuditRequestRef;
}

export interface CreateOperatorOrganizationResult {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
}
