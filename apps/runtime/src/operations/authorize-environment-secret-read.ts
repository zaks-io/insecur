import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizationScope,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type { OrganizationId, ProjectId, RequestId } from "@insecur/domain";

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

async function authorizeUserProjectScopes(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly requestId: RequestId;
  readonly requiredScopes: readonly AuthorizationScope[];
}): Promise<void> {
  if (input.accessActor.type !== "user") {
    throw insufficientScopeError();
  }

  await assertOrganizationMembership(input.accessActor, input.organizationId);

  const coordinate = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  for (const requiredScope of input.requiredScopes) {
    await authorizeScopeOrThrow({
      actor: input.accessActor,
      auditActor: input.auditActor,
      coordinate,
      requiredScope,
      requestId: input.requestId,
    });
  }
}

export async function authorizeProjectReadScope(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly requestId: RequestId;
}): Promise<void> {
  await authorizeUserProjectScopes({
    ...input,
    requiredScopes: [AUTHORIZATION_SCOPES.projectRead],
  });
}

export async function authorizeProjectEnvironmentReadScopes(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly requestId: RequestId;
}): Promise<void> {
  await authorizeUserProjectScopes({
    ...input,
    requiredScopes: [AUTHORIZATION_SCOPES.projectRead, AUTHORIZATION_SCOPES.environmentRead],
  });
}

export async function authorizeEnvironmentSecretReadScopes(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly requestId: RequestId;
}): Promise<void> {
  await authorizeUserProjectScopes({
    ...input,
    requiredScopes: [
      AUTHORIZATION_SCOPES.projectRead,
      AUTHORIZATION_SCOPES.environmentRead,
      AUTHORIZATION_SCOPES.secretRead,
    ],
  });
}
