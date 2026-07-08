import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";
import type {
  ListEnvironmentApprovalsRpcInput,
  ListEnvironmentApprovalsRpcPayload,
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
}
