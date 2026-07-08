import type { CompleteBootstrapOperatorClaimResult } from "@insecur/instance-bootstrap";
import type {
  RegisterAgentSessionRpcInput,
  RegisterAgentSessionRpcPayload,
  ResolveSessionWhoamiRpcInput,
  ResolveSessionWhoamiRpcPayload,
} from "./runtime-session-whoami-rpc-contract.js";
import type {
  CompleteBootstrapClaimRpcInput,
  RevokeCliSessionRpcInput,
  RevokeCliSessionRpcPayload,
  RuntimeRpcResult,
} from "./runtime-rpc-contract.js";

export interface RuntimeSessionRpc {
  completeBootstrapOperatorClaim(
    input: CompleteBootstrapClaimRpcInput,
  ): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>>;
  revokeCliSession(
    input: RevokeCliSessionRpcInput,
  ): Promise<RuntimeRpcResult<RevokeCliSessionRpcPayload>>;
  resolveSessionWhoami(
    input: ResolveSessionWhoamiRpcInput,
  ): Promise<RuntimeRpcResult<ResolveSessionWhoamiRpcPayload>>;
  registerAgentSession(
    input: RegisterAgentSessionRpcInput,
  ): Promise<RuntimeRpcResult<RegisterAgentSessionRpcPayload>>;
}
