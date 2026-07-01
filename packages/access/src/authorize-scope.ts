import type { AuditActorRef } from "@insecur/audit";
import { AUTH_ERROR_CODES, type RequestId } from "@insecur/domain";

import { hasAuthorizationScope } from "./has-authorization-scope.js";
import { recordAccessDenial, type RecordAccessDenialInput } from "./record-access-denial.js";
import {
  resolveEffectiveAccess,
  type ActorRef,
  type ResolveEffectiveAccessDeps,
  type ResourceCoordinate,
} from "./resolve-effective-access.js";
import type { AuthorizationScope } from "./authorization-scopes.js";

type RecordAccessDenialFn = (input: RecordAccessDenialInput) => Promise<unknown>;

export interface AuthorizeScopeDeps extends ResolveEffectiveAccessDeps {
  recordAccessDenial?: RecordAccessDenialFn;
}

export interface AuthorizeScopeInput {
  actor: ActorRef;
  auditActor: AuditActorRef;
  coordinate: ResourceCoordinate;
  requiredScope: AuthorizationScope;
  requestId: RequestId;
  deps?: AuthorizeScopeDeps;
}

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

export async function authorizeScopeOrThrow(input: AuthorizeScopeInput): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(input.actor, input.coordinate, input.deps);
  if (hasAuthorizationScope(effectiveAccess, input.requiredScope)) {
    return;
  }

  const recordDenied = input.deps?.recordAccessDenial ?? recordAccessDenial;
  try {
    await recordDenied({
      actor: input.auditActor,
      organizationId: input.coordinate.organizationId,
      ...(input.coordinate.projectId !== undefined
        ? { projectId: input.coordinate.projectId }
        : {}),
      ...(input.coordinate.environmentId !== undefined
        ? { environmentId: input.coordinate.environmentId }
        : {}),
      request: { requestId: input.requestId },
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  } catch {
    // Preserve the authorization denial; audit availability must not change the access result.
  }
  throw insufficientScopeError();
}
