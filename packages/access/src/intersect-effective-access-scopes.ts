import type { AuthorizationScope } from "./authorization-scopes.js";
import { filterMachineForbiddenScopes } from "./machine-forbidden-scopes.js";

function sortedUniqueScopes(scopeSet: Set<AuthorizationScope>): readonly AuthorizationScope[] {
  return [...scopeSet].sort();
}

/**
 * Intersects membership, token-bound, and credential Authorization Scopes for machine actors.
 * @see docs/adr/0004-machine-identities-and-ci-auth.md
 */
export function intersectEffectiveAccessScopes(
  membershipScopes: readonly AuthorizationScope[],
  tokenBoundScopes: readonly AuthorizationScope[],
  credentialScopes: readonly AuthorizationScope[],
): readonly AuthorizationScope[] {
  const membershipSet = new Set<AuthorizationScope>(membershipScopes);
  const tokenBoundSet = new Set<AuthorizationScope>(tokenBoundScopes);
  const credentialSet = new Set<AuthorizationScope>(credentialScopes);

  const intersection = new Set<AuthorizationScope>();
  for (const scope of membershipSet) {
    if (tokenBoundSet.has(scope) && credentialSet.has(scope)) {
      intersection.add(scope);
    }
  }

  return filterMachineForbiddenScopes(sortedUniqueScopes(intersection));
}
