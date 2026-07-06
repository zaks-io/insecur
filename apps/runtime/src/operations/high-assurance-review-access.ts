import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
  type ActorRef,
  type EffectiveAccessResult,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import type { HighAssuranceChallengeReviewItem } from "@insecur/high-assurance";

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

export function hasHighAssuranceReviewScope(access: EffectiveAccessResult): boolean {
  return (
    hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalApprove) ||
    hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalReject)
  );
}

export async function assertHumanReviewActor(
  accessActor: ActorRef,
  organizationId: OrganizationId,
): Promise<void> {
  if (accessActor.type !== "user") {
    throw insufficientScopeError();
  }
  await assertOrganizationMembership(accessActor, organizationId);
}

export async function filterReviewItemsByEffectiveAccess(
  accessActor: ActorRef,
  organizationId: OrganizationId,
  items: readonly HighAssuranceChallengeReviewItem[],
): Promise<HighAssuranceChallengeReviewItem[]> {
  if (items.length === 0) {
    return [];
  }

  const coordinates = items.map((item) => ({
    organizationId,
    projectId: item.projectId,
    ...(item.environmentId !== undefined ? { environmentId: item.environmentId } : {}),
  }));
  const effectiveAccess = await resolveEffectiveAccessBatch(accessActor, coordinates);

  return items.flatMap((item, index) => {
    const access = effectiveAccess[index];
    if (access === undefined || !hasHighAssuranceReviewScope(access)) {
      return [];
    }
    return [item];
  });
}

export async function resolveProjectReviewAccess(
  accessActor: ActorRef,
  organizationId: OrganizationId,
  projectId: ProjectId,
  environmentId?: EnvironmentId,
): Promise<EffectiveAccessResult> {
  return await resolveEffectiveAccess(accessActor, {
    organizationId,
    projectId,
    ...(environmentId !== undefined ? { environmentId } : {}),
  });
}

export async function authorizeHighAssuranceReviewRead(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly requestId: RequestId;
}): Promise<void> {
  await authorizeScopeOrThrow({
    actor: input.accessActor,
    auditActor: input.auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });
}
