import { AUTH_ERROR_CODES } from "@insecur/domain";
import type { ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import {
  approveApprovalRequest,
  cancelApprovalRequest,
  getApprovalRequestReview,
  listEnvironmentApprovals,
  listPendingApprovalRequests,
  rejectApprovalRequest,
  requestProtectedPromotion,
  requestProtectedRollback,
} from "@insecur/protected-change";
import type {
  ApproveApprovalRequestRpcInput,
  ApproveApprovalRequestRpcPayload,
  CancelApprovalRequestRpcInput,
  CancelApprovalRequestRpcPayload,
  GetApprovalRequestReviewRpcInput,
  GetApprovalRequestReviewRpcPayload,
  ListEnvironmentApprovalsRpcInput,
  ListEnvironmentApprovalsRpcPayload,
  ListPendingApprovalRequestsRpcInput,
  ListPendingApprovalRequestsRpcPayload,
  RejectApprovalRequestRpcInput,
  RejectApprovalRequestRpcPayload,
  RequestProtectedPromotionRpcInput,
  RequestProtectedPromotionRpcPayload,
  RequestProtectedRollbackRpcInput,
  RequestProtectedRollbackRpcPayload,
} from "@insecur/worker-kit";

import {
  assertHumanReviewActor,
  assertHighAssuranceReviewReadPrelude,
} from "./high-assurance-review-access.js";
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

export interface ListPendingApprovalRequestsOperationInput {
  readonly input: ListPendingApprovalRequestsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function listPendingApprovalRequestsOperation({
  input,
  auditActor,
  accessActor,
}: ListPendingApprovalRequestsOperationInput): Promise<ListPendingApprovalRequestsRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  await assertHighAssuranceReviewReadPrelude({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });

  const approvalRequests = await listPendingApprovalRequests({
    actor: accessActor,
    organizationId: input.organizationId,
  });

  return { approvalRequests };
}

export interface GetApprovalRequestReviewOperationInput {
  readonly input: GetApprovalRequestReviewRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function getApprovalRequestReviewOperation({
  input,
  auditActor,
  accessActor,
}: GetApprovalRequestReviewOperationInput): Promise<GetApprovalRequestReviewRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  await assertHighAssuranceReviewReadPrelude({
    accessActor,
    auditActor,
    organizationId: input.organizationId,
    requestId: input.requestId,
  });
  const approvalRequest = await getApprovalRequestReview({
    actor: accessActor,
    auditActor,
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });
  return { approvalRequest };
}

export interface ApproveApprovalRequestOperationInput {
  readonly input: ApproveApprovalRequestRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function approveApprovalRequestOperation({
  input,
  auditActor,
  accessActor,
}: ApproveApprovalRequestOperationInput): Promise<ApproveApprovalRequestRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  return approveApprovalRequest({
    actor: accessActor,
    auditActor,
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    sessionAssurance: input.sessionAssurance,
    impactReviewFingerprint: input.impactReviewFingerprint,
    requestId: input.requestId,
  });
}

export interface RejectApprovalRequestOperationInput {
  readonly input: RejectApprovalRequestRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function rejectApprovalRequestOperation({
  input,
  auditActor,
  accessActor,
}: RejectApprovalRequestOperationInput): Promise<RejectApprovalRequestRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return rejectApprovalRequest({
    actor: accessActor,
    auditActor,
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });
}

export interface CancelApprovalRequestOperationInput {
  readonly input: CancelApprovalRequestRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

export async function cancelApprovalRequestOperation({
  input,
  auditActor,
  accessActor,
}: CancelApprovalRequestOperationInput): Promise<CancelApprovalRequestRpcPayload> {
  await assertHumanReviewActor(accessActor, input.organizationId);
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }
  return cancelApprovalRequest({
    actor: accessActor,
    auditActor,
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
    requestId: input.requestId,
  });
}
