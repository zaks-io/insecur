import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type ActorRef,
  type AuthorizationScope,
  type EffectiveAccessResult,
  type ResolveEffectiveAccessDeps,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";

import { InjectionGrantError } from "./injection-grant-error.js";

type ScopeMatchMode = "any" | "all";

interface AssertRuntimeInjectionScopesInput {
  actor: ActorRef;
  coordinate: ResourceCoordinate;
  requiredScopes: readonly AuthorizationScope[];
  mode: ScopeMatchMode;
  deps?: ResolveEffectiveAccessDeps;
}

function holdsRequiredScopes(
  effectiveAccess: EffectiveAccessResult,
  requiredScopes: readonly AuthorizationScope[],
  mode: ScopeMatchMode,
): boolean {
  if (mode === "any") {
    return requiredScopes.some((scope) => hasAuthorizationScope(effectiveAccess, scope));
  }
  return requiredScopes.every((scope) => hasAuthorizationScope(effectiveAccess, scope));
}

async function assertRuntimeInjectionScopes(
  input: AssertRuntimeInjectionScopesInput,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(input.actor, input.coordinate, input.deps);
  if (!holdsRequiredScopes(effectiveAccess, input.requiredScopes, input.mode)) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "runtime injection scope required",
    );
  }
}

export async function assertRuntimeInjectionAccess(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  requiredScope: AuthorizationScope,
  deps?: ResolveEffectiveAccessDeps,
): Promise<void> {
  await assertRuntimeInjectionScopes({
    actor,
    coordinate,
    requiredScopes: [requiredScope],
    mode: "all",
    ...(deps !== undefined ? { deps } : {}),
  });
}

export async function assertHoldsAnyIssuanceScope(
  actor: ActorRef,
  coordinate: ResourceCoordinate,
  deps?: ResolveEffectiveAccessDeps,
): Promise<void> {
  await assertRuntimeInjectionScopes({
    actor,
    coordinate,
    requiredScopes: [ISSUE_SCOPE, ISSUE_PROTECTED_SCOPE],
    mode: "any",
    ...(deps !== undefined ? { deps } : {}),
  });
}

export const ISSUE_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue;
export const ISSUE_PROTECTED_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected;
export const CONSUME_SCOPE = AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume;

/** Maps environment protection to the one issuance scope the grant service requires. */
export function resolveIssueGrantRequiredScope(isProtected: boolean): AuthorizationScope {
  return isProtected ? ISSUE_PROTECTED_SCOPE : ISSUE_SCOPE;
}
