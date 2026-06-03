import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import type { AuthorizationScope } from "./authorization-scopes.js";
import type { ResourceCoordinate } from "./resolve-effective-access.js";

/** Boundary limiting where a machine credential may act. */
export interface TokenScope {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId?: EnvironmentId;
}

export function tokenScopeCoversCoordinate(
  tokenScope: TokenScope,
  coordinate: ResourceCoordinate,
): boolean {
  if (tokenScope.organizationId !== coordinate.organizationId) {
    return false;
  }
  if (coordinate.projectId !== undefined && tokenScope.projectId !== coordinate.projectId) {
    return false;
  }
  if (tokenScope.environmentId !== undefined) {
    if (coordinate.environmentId === undefined) {
      return false;
    }
    return tokenScope.environmentId === coordinate.environmentId;
  }
  return true;
}

/**
 * Scopes from machine memberships that apply within the token boundary at the coordinate.
 * V1 machine memberships are project-scoped only; token scope further narrows to one environment when set.
 */
export function tokenBoundMembershipScopes(
  membershipScopes: readonly AuthorizationScope[],
  tokenScope: TokenScope,
  coordinate: ResourceCoordinate,
): readonly AuthorizationScope[] {
  if (!tokenScopeCoversCoordinate(tokenScope, coordinate)) {
    return [];
  }
  return membershipScopes;
}
