import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
  type ActorRef,
  type EffectiveAccessResult,
  type UserActorRef,
} from "@insecur/access";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { APPROVAL_ERROR_CODES, AUTH_ERROR_CODES } from "@insecur/domain";
import type { ApprovalRequestDetailRow } from "@insecur/tenant-store";

import { approvalRequestNotFound, ApprovalRequestError } from "./approval-request-errors.js";

function insufficientScopeError(): ApprovalRequestError {
  return new ApprovalRequestError(
    AUTH_ERROR_CODES.insufficientScope,
    "Missing required permission.",
  );
}

export function hasApprovalReviewReadScope(access: EffectiveAccessResult): boolean {
  return (
    hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalApprove) ||
    hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalReject)
  );
}

export async function filterApprovalRequestsByEffectiveAccess(
  accessActor: ActorRef,
  organizationId: OrganizationId,
  rows: readonly ApprovalRequestDetailRow[],
): Promise<readonly ApprovalRequestDetailRow[]> {
  if (rows.length === 0) {
    return [];
  }

  const coordinates = rows.map((row) => ({
    organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
  }));
  const effectiveAccess = await resolveEffectiveAccessBatch(accessActor, coordinates);

  return rows.flatMap((row, index) => {
    const access = effectiveAccess[index];
    if (access === undefined || !hasApprovalReviewReadScope(access)) {
      return [];
    }
    return [row];
  });
}

export async function assertApprovalRequestReviewReadOrMaskNotFound(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  const access = await resolveEnvironmentEffectiveAccess(input);
  if (!hasApprovalReviewReadScope(access)) {
    throw approvalRequestNotFound();
  }
  return access;
}

async function resolveEnvironmentEffectiveAccess(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  return resolveEffectiveAccess(input.accessActor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
}

export async function assertApprovalRequestApproveAccess(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  const access = await resolveEnvironmentEffectiveAccess(input);
  if (!hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalApprove)) {
    throw insufficientScopeError();
  }
  return access;
}

export async function assertApprovalRequestRejectAccess(input: {
  readonly accessActor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<EffectiveAccessResult> {
  const access = await resolveEnvironmentEffectiveAccess(input);
  if (!hasAuthorizationScope(access, AUTHORIZATION_SCOPES.approvalReject)) {
    throw insufficientScopeError();
  }
  return access;
}

export function assertApprovalRequestPending(row: ApprovalRequestDetailRow): void {
  if (row.status !== "pending") {
    throw new ApprovalRequestError(
      APPROVAL_ERROR_CODES.requestNotPending,
      "approval request is not pending",
    );
  }
}

export function assertRequesterCanCancel(input: {
  readonly actor: UserActorRef;
  readonly row: ApprovalRequestDetailRow;
  readonly access: EffectiveAccessResult;
}): void {
  const isRequester =
    (input.row.requesterUserId !== null && input.row.requesterUserId === input.actor.userId) ||
    false;
  const isCleanupActor = hasAuthorizationScope(input.access, AUTHORIZATION_SCOPES.membershipManage);
  if (!isRequester && !isCleanupActor) {
    throw insufficientScopeError();
  }
}
