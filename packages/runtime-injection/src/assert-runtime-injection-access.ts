import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type ActorRef,
  type AuthorizationScope,
  type ResolveEffectiveAccessOptions,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";

export async function assertRuntimeInjectionAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  requiredScope: AuthorizationScope,
  options?: ResolveEffectiveAccessOptions,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate, options);
  if (!hasAuthorizationScope(effectiveAccess, requiredScope)) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection scope required",
    );
  }
}

export const ISSUE_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue;
export const CONSUME_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume;
