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
  OPERATION_ERROR_CODES,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import type { HighAssuranceChallengeReviewItem } from "@insecur/high-assurance";
import { toHighAssuranceChallengeReviewItem } from "@insecur/high-assurance";
import {
  getOperation,
  OperationStoreError,
  type OperationHighAssuranceChallengeEvidence,
  type OperationPollResult,
} from "@insecur/operations";

function insufficientScopeError(): Error & { code: typeof AUTH_ERROR_CODES.insufficientScope } {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

function highAssuranceChallengeNotFound(): OperationStoreError {
  return new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
}

function hasHighAssuranceReviewScope(access: EffectiveAccessResult): boolean {
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

export async function assertHighAssuranceReviewReadPrelude(input: {
  readonly accessActor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly requestId: RequestId;
}): Promise<void> {
  await assertHumanReviewActor(input.accessActor, input.organizationId);
  await authorizeHighAssuranceReviewRead(input);
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

async function assertReviewScopeOrMaskNotFound(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  const access = await resolveProjectReviewAccess(
    input.accessActor,
    input.organizationId,
    input.projectId,
    input.environmentId,
  );
  if (!hasHighAssuranceReviewScope(access)) {
    throw highAssuranceChallengeNotFound();
  }
  return access;
}

async function fetchOperationOrRethrow(input: {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
}): Promise<OperationPollResult> {
  try {
    return await getOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
    });
  } catch (error) {
    if (error instanceof OperationStoreError && error.code === OPERATION_ERROR_CODES.notFound) {
      throw error;
    }
    throw error;
  }
}

export async function loadHighAssuranceChallengeEvidenceOrMaskNotFound(input: {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
}): Promise<{
  readonly operation: OperationPollResult;
  readonly evidence: OperationHighAssuranceChallengeEvidence;
}> {
  const operation = await fetchOperationOrRethrow(input);
  const evidence = operation.progress.highAssuranceChallenge;
  if (evidence === undefined) {
    throw highAssuranceChallengeNotFound();
  }
  return { operation, evidence };
}

export async function loadReviewableHighAssuranceChallenge(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
}): Promise<HighAssuranceChallengeReviewItem> {
  const { operation } = await loadHighAssuranceChallengeEvidenceOrMaskNotFound({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });

  const challenge = toHighAssuranceChallengeReviewItem(operation);
  if (challenge === null) {
    throw highAssuranceChallengeNotFound();
  }

  await assertReviewScopeOrMaskNotFound({
    accessActor: input.accessActor,
    organizationId: input.organizationId,
    projectId: challenge.projectId,
    ...(challenge.environmentId !== undefined ? { environmentId: challenge.environmentId } : {}),
  });

  return challenge;
}

export async function prepareMutationReviewAccess(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  await assertHumanReviewActor(input.accessActor, input.organizationId);
  return await resolveProjectReviewAccess(
    input.accessActor,
    input.organizationId,
    input.projectId,
    input.environmentId,
  );
}

async function authorizeHighAssuranceReviewRead(input: {
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
