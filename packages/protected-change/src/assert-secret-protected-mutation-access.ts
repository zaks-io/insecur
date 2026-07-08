import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type ActorRef,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

function assertSecretProtectedDraftWriteAccess(
  scope: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  },
  effectiveAccess: Awaited<ReturnType<typeof resolveEffectiveAccess>>,
): void {
  if (
    effectiveAccess.organizationId !== scope.organizationId ||
    !hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.secretProtectedDraftWrite)
  ) {
    throw Object.assign(new Error("secret protected draft write scope required"), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
}

export async function assertSecretProtectedMutationAccess(
  actor: ActorRef,
  scope: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  },
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, scope);
  assertSecretProtectedDraftWriteAccess(scope, effectiveAccess);
}
