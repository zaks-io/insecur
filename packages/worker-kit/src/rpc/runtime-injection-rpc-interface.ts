import type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
import type {
  CreateRuntimeInjectionPolicyRpcInput,
  CreateRuntimeInjectionPolicyRpcPayload,
  DisableRuntimeInjectionPolicyRpcInput,
  DisableRuntimeInjectionPolicyRpcPayload,
  GetRuntimeInjectionPolicyRpcInput,
  GetRuntimeInjectionPolicyRpcPayload,
} from "./runtime-run-policies-rpc-contract.js";
import type { IssueInjectionGrantRpcInput, RuntimeRpcResult } from "./runtime-rpc-contract.js";

export interface RuntimeInjectionRpc {
  issueInjectionGrant(
    input: IssueInjectionGrantRpcInput,
  ): Promise<RuntimeRpcResult<IssueInjectionGrantResult>>;
  createRuntimeInjectionPolicy(
    input: CreateRuntimeInjectionPolicyRpcInput,
  ): Promise<RuntimeRpcResult<CreateRuntimeInjectionPolicyRpcPayload>>;
  getRuntimeInjectionPolicy(
    input: GetRuntimeInjectionPolicyRpcInput,
  ): Promise<RuntimeRpcResult<GetRuntimeInjectionPolicyRpcPayload>>;
  disableRuntimeInjectionPolicy(
    input: DisableRuntimeInjectionPolicyRpcInput,
  ): Promise<RuntimeRpcResult<DisableRuntimeInjectionPolicyRpcPayload>>;
}
