import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  listEnvironmentApprovals,
  requestProtectedPromotion,
  requestProtectedRollback,
} from "@insecur/protected-change";
import type {
  ListEnvironmentApprovalsRpcInput,
  ListEnvironmentApprovalsRpcPayload,
  RequestProtectedPromotionRpcInput,
  RequestProtectedPromotionRpcPayload,
  RequestProtectedRollbackRpcInput,
  RequestProtectedRollbackRpcPayload,
} from "@insecur/worker-kit";

import { assertUserOrganizationMembership } from "./metadata-operation-shared.js";

export interface RequestProtectedPromotionOperationInput {
  readonly input: RequestProtectedPromotionRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function requestProtectedPromotionOperation({
  input,
  accessActor,
}: RequestProtectedPromotionOperationInput): Promise<RequestProtectedPromotionRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);

  return requestProtectedPromotion({
    actor: accessActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    draftVersionIds: input.draftVersionIds,
    requestId: input.requestId,
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.impactReviewFingerprint !== undefined
      ? { impactReviewFingerprint: input.impactReviewFingerprint }
      : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
}

export interface RequestProtectedRollbackOperationInput {
  readonly input: RequestProtectedRollbackRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function requestProtectedRollbackOperation({
  input,
  accessActor,
}: RequestProtectedRollbackOperationInput): Promise<RequestProtectedRollbackRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);

  return requestProtectedRollback({
    actor: accessActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretId: input.secretId,
    toVersionId: input.toVersionId,
    promoteRequested: input.promoteRequested,
    requestId: input.requestId,
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
}

export interface ListEnvironmentApprovalsOperationInput {
  readonly input: ListEnvironmentApprovalsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function listEnvironmentApprovalsOperation({
  input,
  accessActor,
}: ListEnvironmentApprovalsOperationInput): Promise<ListEnvironmentApprovalsRpcPayload> {
  await assertUserOrganizationMembership(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  const approvals = await listEnvironmentApprovals({
    actor: accessActor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  return { approvals };
}
