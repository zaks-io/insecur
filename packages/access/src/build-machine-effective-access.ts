import type { AuthorizationScope } from "./authorization-scopes.js";
import { filterMachineMembershipsForCoordinate } from "./filter-machine-memberships-for-coordinate.js";
import { intersectEffectiveAccessScopes } from "./intersect-effective-access-scopes.js";
import type { MachineMembershipRow } from "./machine-membership-row.js";
import { tokenBoundMembershipScopes } from "./token-scope-boundary.js";
import type { MachineActorRef, ResourceCoordinate } from "./resolve-effective-access.js";

function unionMachineMembershipScopes(
  memberships: readonly MachineMembershipRow[],
): readonly AuthorizationScope[] {
  const scopeSet = new Set<AuthorizationScope>();
  for (const membership of memberships) {
    for (const scope of membership.authorizationScopes) {
      scopeSet.add(scope);
    }
  }
  return [...scopeSet].sort();
}

/** Expands machine memberships into coordinate-bound Effective Access via intersection. */
export function buildMachineEffectiveAccessScopes(
  actor: MachineActorRef,
  coordinate: ResourceCoordinate,
  memberships: readonly MachineMembershipRow[],
): readonly AuthorizationScope[] {
  const applicableMemberships = filterMachineMembershipsForCoordinate(memberships, coordinate);
  const membershipScopes = unionMachineMembershipScopes(applicableMemberships);
  const tokenBoundScopes = tokenBoundMembershipScopes(
    membershipScopes,
    actor.tokenScope,
    coordinate,
  );

  return intersectEffectiveAccessScopes(membershipScopes, tokenBoundScopes, actor.credentialScopes);
}
