import type {
  ApproveApprovalRequestRpcInput,
  CancelApprovalRequestRpcInput,
  GetApprovalRequestReviewRpcInput,
  ListEnvironmentApprovalsRpcInput,
  ListPendingApprovalRequestsRpcInput,
  RejectApprovalRequestRpcInput,
  RequestProtectedPromotionRpcInput,
  RequestProtectedRollbackRpcInput,
} from "@insecur/worker-kit";

import {
  RUNTIME_POST_AUTH_RPC,
  type RuntimePostAuthRpcHost,
} from "./runtime-service-delegated-post-auth-rpc-host.js";
import {
  approveApprovalRequestRpc,
  cancelApprovalRequestRpc,
  getApprovalRequestReviewRpc,
  listEnvironmentApprovalsRpc,
  listPendingApprovalRequestsRpc,
  rejectApprovalRequestRpc,
  requestProtectedPromotionRpc,
  requestProtectedRollbackRpc,
} from "./runtime-protected-change-rpc-delegates.js";

/**
 * Protected-change post-auth RPC methods (INS-439). Split from the main delegated-RPC object so
 * neither file crosses the `max-lines` boundary as backend RPCs are added; spread into
 * `RuntimeServiceDelegatedPostAuthRpc`.
 */
export const RuntimeServiceProtectedChangePostAuthRpc = {
  requestProtectedPromotion(
    this: RuntimePostAuthRpcHost,
    input: RequestProtectedPromotionRpcInput,
  ) {
    return requestProtectedPromotionRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  requestProtectedRollback(this: RuntimePostAuthRpcHost, input: RequestProtectedRollbackRpcInput) {
    return requestProtectedRollbackRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listEnvironmentApprovals(this: RuntimePostAuthRpcHost, input: ListEnvironmentApprovalsRpcInput) {
    return listEnvironmentApprovalsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  listPendingApprovalRequests(
    this: RuntimePostAuthRpcHost,
    input: ListPendingApprovalRequestsRpcInput,
  ) {
    return listPendingApprovalRequestsRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  getApprovalRequestReview(this: RuntimePostAuthRpcHost, input: GetApprovalRequestReviewRpcInput) {
    return getApprovalRequestReviewRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  approveApprovalRequest(this: RuntimePostAuthRpcHost, input: ApproveApprovalRequestRpcInput) {
    return approveApprovalRequestRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  rejectApprovalRequest(this: RuntimePostAuthRpcHost, input: RejectApprovalRequestRpcInput) {
    return rejectApprovalRequestRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
  cancelApprovalRequest(this: RuntimePostAuthRpcHost, input: CancelApprovalRequestRpcInput) {
    return cancelApprovalRequestRpc(this[RUNTIME_POST_AUTH_RPC](), input);
  },
};
