import type {
  CreateRuntimeInjectionPolicyRpcInput,
  CreateRuntimeInjectionPolicyRpcPayload,
  DisableRuntimeInjectionPolicyRpcInput,
  DisableRuntimeInjectionPolicyRpcPayload,
  GetRuntimeInjectionPolicyRpcInput,
  GetRuntimeInjectionPolicyRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import { createRuntimeInjectionPolicyOperation } from "../operations/create-runtime-injection-policy-operation.js";
import { disableRuntimeInjectionPolicyOperation } from "../operations/disable-runtime-injection-policy-operation.js";
import { getRuntimeInjectionPolicyOperation } from "../operations/get-runtime-injection-policy-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function createRuntimeInjectionPolicyRpc(
  post: PostAuthRpcRunner,
  input: CreateRuntimeInjectionPolicyRpcInput,
): Promise<RuntimeRpcResult<CreateRuntimeInjectionPolicyRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    createRuntimeInjectionPolicyOperation({ input, auditActor, accessActor }),
  );
}

export function getRuntimeInjectionPolicyRpc(
  post: PostAuthRpcRunner,
  input: GetRuntimeInjectionPolicyRpcInput,
): Promise<RuntimeRpcResult<GetRuntimeInjectionPolicyRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    getRuntimeInjectionPolicyOperation({ input, auditActor, accessActor }),
  );
}

export function disableRuntimeInjectionPolicyRpc(
  post: PostAuthRpcRunner,
  input: DisableRuntimeInjectionPolicyRpcInput,
): Promise<RuntimeRpcResult<DisableRuntimeInjectionPolicyRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    disableRuntimeInjectionPolicyOperation({ input, auditActor, accessActor }),
  );
}
