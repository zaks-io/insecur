import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type UserActorRef,
} from "@insecur/access";
import { AUTH_ERROR_CODES, type OrganizationId, type ProjectId } from "@insecur/domain";
import { MembershipManagementError } from "./membership-management-error.js";

export async function assertMembershipManageScope(
  actor: UserActorRef,
  organizationId: OrganizationId,
  projectId?: ProjectId,
): Promise<void> {
  const coordinate = projectId === undefined ? { organizationId } : { organizationId, projectId };
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);

  if (!hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.membershipManage)) {
    throw new MembershipManagementError(
      AUTH_ERROR_CODES.insufficientScope,
      "membership management scope required",
      organizationId,
    );
  }
}
