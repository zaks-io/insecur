import type {
  ListEnvironmentApprovalsRpcInput,
  ListEnvironmentApprovalsRpcPayload,
  RequestProtectedPromotionRpcInput,
  RequestProtectedPromotionRpcPayload,
  RequestProtectedRollbackRpcInput,
  RequestProtectedRollbackRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import {
  listEnvironmentApprovalsOperation,
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
