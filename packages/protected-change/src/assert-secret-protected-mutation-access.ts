import { resolveEffectiveAccess, type UserActorRef } from "@insecur/access";
import { assertSecretProtectedDraftWriteAccess } from "@insecur/secret-store";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

export async function assertSecretProtectedMutationAccess(
  actor: UserActorRef,
  scope: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  },
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, scope);
  assertSecretProtectedDraftWriteAccess(scope, effectiveAccess, scope);
}
