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
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import {
  approveApprovalRequestOperation,
  cancelApprovalRequestOperation,
  getApprovalRequestReviewOperation,
  listEnvironmentApprovalsOperation,
  listPendingApprovalRequestsOperation,
  rejectApprovalRequestOperation,
  requestProtectedPromotionOperation,
  requestProtectedRollbackOperation,
} from "../operations/protected-change-operations.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function requestProtectedPromotionRpc(
  post: PostAuthRpcRunner,
  input: RequestProtectedPromotionRpcInput,
): Promise<RuntimeRpcResult<RequestProtectedPromotionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    requestProtectedPromotionOperation({ input, auditActor, accessActor }),
  );
}

export function requestProtectedRollbackRpc(
  post: PostAuthRpcRunner,
  input: RequestProtectedRollbackRpcInput,
): Promise<RuntimeRpcResult<RequestProtectedRollbackRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    requestProtectedRollbackOperation({ input, auditActor, accessActor }),
  );
}

export function listEnvironmentApprovalsRpc(
  post: PostAuthRpcRunner,
  input: ListEnvironmentApprovalsRpcInput,
): Promise<RuntimeRpcResult<ListEnvironmentApprovalsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listEnvironmentApprovalsOperation({ input, auditActor, accessActor }),
  );
}

export function listPendingApprovalRequestsRpc(
  post: PostAuthRpcRunner,
  input: ListPendingApprovalRequestsRpcInput,
): Promise<RuntimeRpcResult<ListPendingApprovalRequestsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listPendingApprovalRequestsOperation({ input, auditActor, accessActor }),
  );
}

export function getApprovalRequestReviewRpc(
  post: PostAuthRpcRunner,
  input: GetApprovalRequestReviewRpcInput,
): Promise<RuntimeRpcResult<GetApprovalRequestReviewRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    getApprovalRequestReviewOperation({ input, auditActor, accessActor }),
  );
}

export function approveApprovalRequestRpc(
  post: PostAuthRpcRunner,
  input: ApproveApprovalRequestRpcInput,
): Promise<RuntimeRpcResult<ApproveApprovalRequestRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    approveApprovalRequestOperation({ input, auditActor, accessActor }),
  );
}

export function rejectApprovalRequestRpc(
  post: PostAuthRpcRunner,
  input: RejectApprovalRequestRpcInput,
): Promise<RuntimeRpcResult<RejectApprovalRequestRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    rejectApprovalRequestOperation({ input, auditActor, accessActor }),
  );
}

export function cancelApprovalRequestRpc(
  post: PostAuthRpcRunner,
  input: CancelApprovalRequestRpcInput,
): Promise<RuntimeRpcResult<CancelApprovalRequestRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    cancelApprovalRequestOperation({ input, auditActor, accessActor }),
  );
}
