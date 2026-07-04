import { AUTH_ERROR_CODES, type OrganizationId, type ProjectId } from "@insecur/domain";
import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  type AuthorizationScope,
  type UserActorRef,
} from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";

async function assertConnectionScope(
  actor: UserActorRef,
  organizationId: OrganizationId,
  requiredScope: AuthorizationScope,
  projectId?: ProjectId,
): Promise<void> {
  const coordinate = projectId === undefined ? { organizationId } : { organizationId, projectId };
  const effectiveAccess = await resolveEffectiveAccess(actor, coordinate);

  if (!hasAuthorizationScope(effectiveAccess, requiredScope)) {
    throw new AppConnectionError(
      AUTH_ERROR_CODES.insufficientScope,
      `${requiredScope} scope required`,
    );
  }
}

export async function assertConnectionManageScope(
  actor: UserActorRef,
  organizationId: OrganizationId,
  projectId?: ProjectId,
): Promise<void> {
  await assertConnectionScope(
    actor,
    organizationId,
    AUTHORIZATION_SCOPES.connectionManage,
    projectId,
  );
}

export async function assertConnectionReadScope(
  actor: UserActorRef,
  organizationId: OrganizationId,
  projectId?: ProjectId,
): Promise<void> {
  await assertConnectionScope(
    actor,
    organizationId,
    AUTHORIZATION_SCOPES.connectionRead,
    projectId,
  );
}

export function isConnectionAccessDenied(error: unknown): error is AppConnectionError {
  return error instanceof AppConnectionError && error.code === AUTH_ERROR_CODES.insufficientScope;
}
