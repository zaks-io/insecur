import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type ActorRef,
  type AuthorizationScope,
  type ResolveEffectiveAccessDeps,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";

export async function assertRuntimeInjectionAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  requiredScope: AuthorizationScope,
  deps?: ResolveEffectiveAccessDeps,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate, deps);
  if (!hasAuthorizationScope(effectiveAccess, requiredScope)) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection scope required",
    );
  }
}

/**
 * Fail-closed pre-check run *before* the tenant coordinate read so an actor holding neither issuance
 * atom is rejected with `insufficient_scope` without first probing whether the foreign coordinate
 * exists (INS-181). The precise `isProtected`-dependent atom is still enforced afterward by
 * {@link assertRuntimeInjectionAccess}; this only proves the actor could plausibly issue at all, so
 * the coordinate read never becomes an existence oracle for unauthorized callers.
 */
export async function assertHoldsAnyIssuanceScope(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  deps?: ResolveEffectiveAccessDeps,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate, deps);
  if (
    !hasAuthorizationScope(effectiveAccess, ISSUE_SCOPE) &&
    !hasAuthorizationScope(effectiveAccess, ISSUE_PROTECTED_SCOPE)
  ) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection scope required",
    );
  }
}

export const ISSUE_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue;
export const ISSUE_PROTECTED_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected;
export const CONSUME_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume;

/** Maps environment protection to the one issuance scope the grant service requires. */
export function resolveIssueGrantRequiredScope(isProtected: boolean): AuthorizationScope {
  return isProtected ? ISSUE_PROTECTED_SCOPE : ISSUE_SCOPE;
}
