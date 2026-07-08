import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";
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
} from "./runtime-protected-change-rpc-contract.js";

export interface RuntimeProtectedChangeRpc {
  requestProtectedPromotion(
    input: RequestProtectedPromotionRpcInput,
  ): Promise<RuntimeRpcResult<RequestProtectedPromotionRpcPayload>>;
  requestProtectedRollback(
    input: RequestProtectedRollbackRpcInput,
  ): Promise<RuntimeRpcResult<RequestProtectedRollbackRpcPayload>>;
  listEnvironmentApprovals(
    input: ListEnvironmentApprovalsRpcInput,
  ): Promise<RuntimeRpcResult<ListEnvironmentApprovalsRpcPayload>>;
  listPendingApprovalRequests(
    input: ListPendingApprovalRequestsRpcInput,
  ): Promise<RuntimeRpcResult<ListPendingApprovalRequestsRpcPayload>>;
  getApprovalRequestReview(
    input: GetApprovalRequestReviewRpcInput,
  ): Promise<RuntimeRpcResult<GetApprovalRequestReviewRpcPayload>>;
  approveApprovalRequest(
    input: ApproveApprovalRequestRpcInput,
  ): Promise<RuntimeRpcResult<ApproveApprovalRequestRpcPayload>>;
  rejectApprovalRequest(
    input: RejectApprovalRequestRpcInput,
  ): Promise<RuntimeRpcResult<RejectApprovalRequestRpcPayload>>;
  cancelApprovalRequest(
    input: CancelApprovalRequestRpcInput,
  ): Promise<RuntimeRpcResult<CancelApprovalRequestRpcPayload>>;
}
