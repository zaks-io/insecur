import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  type ActorRef,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type { OrganizationId, ProjectId, RequestId } from "@insecur/domain";

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

export async function authorizeEnvironmentSecretReadScopes(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly requestId: RequestId;
}): Promise<void> {
  if (input.accessActor.type !== "user") {
    throw insufficientScopeError();
  }

  await assertOrganizationMembership(input.accessActor, input.organizationId);

  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  for (const requiredScope of [
    AUTHORIZATION_SCOPES.projectRead,
    AUTHORIZATION_SCOPES.environmentRead,
    AUTHORIZATION_SCOPES.secretRead,
  ]) {
    await authorizeScopeOrThrow({
      actor: input.accessActor,
      auditActor: input.auditActor,
      coordinate,
      requiredScope,
      requestId: input.requestId,
    });
  }
}
