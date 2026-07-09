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
import type { SecretVersionCreatorActor } from "@insecur/tenant-store";

interface DiscardAccessScope {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

/**
 * Owner/admin cleanup authority for Draft Version Discard (ADR-0017 §27). The `project:configure`
 * scope is held only by the owner and admin Built-In Role bundles, never by developer, so it is the
 * discard-cleanup marker. Draft-write scope alone (which developers hold) does NOT authorize
 * discarding another actor's draft.
 */
const OWNER_ADMIN_CLEANUP_SCOPE = AUTHORIZATION_SCOPES.projectConfigure;

function actorIsCreator(actor: ActorRef, creator: SecretVersionCreatorActor | null): boolean {
  if (creator === null) {
    return false;
  }
  if (actor.type === "user" && creator.type === "user") {
    return actor.userId === creator.userId;
  }
  if (actor.type === "machine" && creator.type === "machine") {
    return actor.machineIdentityId === creator.machineIdentityId;
  }
  return false;
}

function insufficientScope(): Error {
  return Object.assign(
    new Error("discard requires draft creator or owner/admin cleanup authority"),
    {
      code: AUTH_ERROR_CODES.insufficientScope,
    },
  );
}

/**
 * Draft Version Discard authorization (ADR-0017 §27): the creating User or Machine Identity may
 * discard while still authorized for the affected Project and Protected Environment, and scoped
 * owner/admin users may discard for cleanup. Fails CLOSED — a creator-less draft (unknown creator)
 * is discardable only by an owner/admin cleanup actor. The bare `secretProtectedDraftWrite` scope
 * used to create the draft does NOT by itself authorize discarding someone else's draft.
 */
export async function assertDiscardDraftVersionAccess(
  actor: ActorRef,
  scope: DiscardAccessScope,
  creator: SecretVersionCreatorActor | null,
): Promise<void> {
  const effectiveAccess = await resolveEffectiveAccess(actor, scope);
  if (effectiveAccess.organizationId !== scope.organizationId) {
    throw insufficientScope();
  }

  const isOwnerAdminCleanup = hasAuthorizationScope(effectiveAccess, OWNER_ADMIN_CLEANUP_SCOPE);
  if (isOwnerAdminCleanup) {
    return;
  }

  const isCreatorWithDraftWrite =
    actorIsCreator(actor, creator) &&
    hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.secretProtectedDraftWrite);
  if (isCreatorWithDraftWrite) {
    return;
  }

  throw insufficientScope();
}
