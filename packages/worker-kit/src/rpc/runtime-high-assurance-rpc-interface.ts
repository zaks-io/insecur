import type {
  ClearHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcPayload,
  DenyHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcPayload,
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
} from "./runtime-high-assurance-rpc-contract.js";
import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";

export interface RuntimeHighAssuranceRpc {
  listPendingHighAssuranceChallenges(
    input: ListPendingHighAssuranceChallengesRpcInput,
  ): Promise<RuntimeRpcResult<ListPendingHighAssuranceChallengesRpcPayload>>;
  getHighAssuranceChallenge(
    input: GetHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<GetHighAssuranceChallengeRpcPayload>>;
  clearHighAssuranceChallenge(
    input: ClearHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<ClearHighAssuranceChallengeRpcPayload>>;
  denyHighAssuranceChallenge(
    input: DenyHighAssuranceChallengeRpcInput,
  ): Promise<RuntimeRpcResult<DenyHighAssuranceChallengeRpcPayload>>;
}
