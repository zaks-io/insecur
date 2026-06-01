import type { AuthorizationScope } from "./authorization-scopes.js";
import type { EffectiveAccessResult } from "./resolve-effective-access.js";

/** Scope-first membership test against a resolved Effective Access set. */
export function hasAuthorizationScope(
  effectiveAccess: EffectiveAccessResult,
  requiredScope: AuthorizationScope,
): boolean {
  return effectiveAccess.scopes.includes(requiredScope);
}
