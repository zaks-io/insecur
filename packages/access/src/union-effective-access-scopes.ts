import { expandBuiltInRolePresetToScopes } from "./built-in-role-scopes.js";
import type { AuthorizationScope } from "./authorization-scopes.js";
import type { MembershipRow } from "./membership-row.js";

function scopesForMembership(row: MembershipRow): readonly AuthorizationScope[] {
  return expandBuiltInRolePresetToScopes(row.rolePreset);
}

/**
 * Unions organization-tier and project-tier grants from applicable Membership rows.
 */
export function unionEffectiveAccessScopes(
  memberships: readonly MembershipRow[],
): readonly AuthorizationScope[] {
  const scopeSet = new Set<AuthorizationScope>();
  for (const membership of memberships) {
    for (const scope of scopesForMembership(membership)) {
      scopeSet.add(scope);
    }
  }
  return [...scopeSet].sort();
}
