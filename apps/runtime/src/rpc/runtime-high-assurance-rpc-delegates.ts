import type {
  ClearHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcPayload,
  DenyHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcPayload,
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import { clearHighAssuranceChallengeOperation } from "../operations/clear-high-assurance-challenge-operation.js";
import { denyHighAssuranceChallengeOperation } from "../operations/deny-high-assurance-challenge-operation.js";
import { getHighAssuranceChallengeOperation } from "../operations/get-high-assurance-challenge-operation.js";
import { listPendingHighAssuranceChallengesOperation } from "../operations/list-pending-high-assurance-challenges-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function listPendingHighAssuranceChallengesRpc(
  post: PostAuthRpcRunner,
  input: ListPendingHighAssuranceChallengesRpcInput,
): Promise<RuntimeRpcResult<ListPendingHighAssuranceChallengesRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listPendingHighAssuranceChallengesOperation({ input, auditActor, accessActor }),
  );
}

export function getHighAssuranceChallengeRpc(
  post: PostAuthRpcRunner,
  input: GetHighAssuranceChallengeRpcInput,
): Promise<RuntimeRpcResult<GetHighAssuranceChallengeRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    getHighAssuranceChallengeOperation({ input, auditActor, accessActor }),
  );
}

export function clearHighAssuranceChallengeRpc(
  post: PostAuthRpcRunner,
  input: ClearHighAssuranceChallengeRpcInput,
): Promise<RuntimeRpcResult<ClearHighAssuranceChallengeRpcPayload>> {
  return post(input.actorToken, ({ accessActor, actor }) =>
    clearHighAssuranceChallengeOperation({
      input,
      auditActor: { type: "user", userId: actor.userId },
      accessActor,
      clearingUserId: actor.userId,
    }),
  );
}

export function denyHighAssuranceChallengeRpc(
  post: PostAuthRpcRunner,
  input: DenyHighAssuranceChallengeRpcInput,
): Promise<RuntimeRpcResult<DenyHighAssuranceChallengeRpcPayload>> {
  return post(input.actorToken, ({ accessActor, actor }) =>
    denyHighAssuranceChallengeOperation({
      input,
      auditActor: { type: "user", userId: actor.userId },
      accessActor,
      denyingUserId: actor.userId,
    }),
  );
}
