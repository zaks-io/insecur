import type {
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryEnvelope,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "@insecur/worker-kit";

import { consumeGrantAllOperation } from "../operations/consume-grant-all-operation.js";
import { consumeGrantOperation } from "../operations/consume-grant-operation.js";
import { writeSecretOperation } from "../operations/write-secret-operation.js";
import type { RuntimeEnv } from "../env.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function consumeGrantRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ConsumeGrantRpcInput,
): Promise<RuntimeRpcResult<RuntimeDeliveryEnvelope>> {
  return post(input.actorToken, ({ accessActor }) =>
    consumeGrantOperation({ env, input, actor: accessActor }),
  );
}

export function consumeGrantAllRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ConsumeGrantAllRpcInput,
): Promise<RuntimeRpcResult<RuntimeDeliveryAllEnvelope>> {
  return post(input.actorToken, ({ accessActor }) =>
    consumeGrantAllOperation({ env, input, actor: accessActor }),
  );
}

export function writeSecretRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: WriteSecretRpcInput,
): Promise<RuntimeRpcResult<RuntimeSecretWritePayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    writeSecretOperation({ env, input, auditActor, accessActor }),
  );
}
