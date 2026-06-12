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

export const ISSUE_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue;
export const ISSUE_PROTECTED_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected;
export const CONSUME_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume;

/** Maps environment protection to the one issuance scope the grant service requires. */
export function resolveIssueGrantRequiredScope(isProtected: boolean): AuthorizationScope {
  return isProtected ? ISSUE_PROTECTED_SCOPE : ISSUE_SCOPE;
}
