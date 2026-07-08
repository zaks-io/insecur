import type {
  ListProjectInjectionGrantsRpcInput,
  ListProjectInjectionGrantsRpcPayload,
  ListProjectMachineIdentitiesRpcInput,
  ListProjectMachineIdentitiesRpcPayload,
  RuntimeRpcResult,
} from "@insecur/worker-kit";

import { listProjectInjectionGrantsOperation } from "../operations/list-project-injection-grants-operation.js";
import { listProjectMachineIdentitiesOperation } from "../operations/list-project-machine-identities-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function listProjectMachineIdentitiesRpc(
  post: PostAuthRpcRunner,
  input: ListProjectMachineIdentitiesRpcInput,
): Promise<RuntimeRpcResult<ListProjectMachineIdentitiesRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listProjectMachineIdentitiesOperation({ input, auditActor, accessActor }),
  );
}

export function listProjectInjectionGrantsRpc(
  post: PostAuthRpcRunner,
  input: ListProjectInjectionGrantsRpcInput,
): Promise<RuntimeRpcResult<ListProjectInjectionGrantsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listProjectInjectionGrantsOperation({ input, auditActor, accessActor }),
  );
}
