import type { MachineIdentityId, MembershipId, OrganizationId, ProjectId } from "@insecur/domain";
import type { AuthorizationScope } from "./authorization-scopes.js";

/** Project-scoped Machine Identity membership row used to expand Effective Access. */
export interface MachineMembershipRow {
  membershipId: MembershipId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  machineIdentityId: MachineIdentityId;
  authorizationScopes: readonly AuthorizationScope[];
}
