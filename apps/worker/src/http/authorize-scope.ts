import {
  hasAuthorizationScope,
  recordAccessDenial,
  resolveEffectiveAccess,
  type AuthorizationScope,
  type ResourceCoordinate,
} from "@insecur/access";
import { AUTH_ERROR_CODES, type RequestId } from "@insecur/domain";
import type { AuditActorRef } from "@insecur/audit";
import type { ActorRef } from "@insecur/access";

export async function authorizeScopeOrThrow(input: {
  actor: ActorRef;
  auditActor: AuditActorRef;
  coordinate: ResourceCoordinate;
  requiredScope: AuthorizationScope;
  requestId: RequestId;
}): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(input.actor, input.coordinate);
  if (hasAuthorizationScope(effectiveAccess, input.requiredScope)) {
    return;
  }
  await recordAccessDenial({
    actor: input.auditActor,
    organizationId: input.coordinate.organizationId,
    ...(input.coordinate.projectId !== undefined ? { projectId: input.coordinate.projectId } : {}),
    ...(input.coordinate.environmentId !== undefined
      ? { environmentId: input.coordinate.environmentId }
      : {}),
    request: { requestId: input.requestId },
    reasonCode: AUTH_ERROR_CODES.insufficientScope,
  });
  throw Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}
