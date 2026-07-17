import type {
  CreateSecretSyncRpcInput,
  RunSecretSyncRpcInput,
  RuntimeRpcResult,
  SecretSyncMutationRpcPayload,
  SecretSyncRunRpcPayload,
  UpdateSecretSyncRpcInput,
} from "@insecur/worker-kit";

import {
  createSecretSyncOperation,
  runSecretSyncOperation,
  updateSecretSyncOperation,
} from "../operations/secret-sync-operations.js";
import type { RuntimeEnv } from "../env.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function createSecretSyncRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: CreateSecretSyncRpcInput,
): Promise<RuntimeRpcResult<SecretSyncMutationRpcPayload>> {
  return post(input.actorToken, ({ accessActor }) =>
    createSecretSyncOperation({ env, input, accessActor }),
  );
}

export function updateSecretSyncRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: UpdateSecretSyncRpcInput,
): Promise<RuntimeRpcResult<SecretSyncMutationRpcPayload>> {
  return post(input.actorToken, ({ accessActor }) =>
    updateSecretSyncOperation({ env, input, accessActor }),
  );
}

export function runSecretSyncRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: RunSecretSyncRpcInput,
): Promise<RuntimeRpcResult<SecretSyncRunRpcPayload>> {
  return post(input.actorToken, ({ accessActor }) =>
    runSecretSyncOperation({ env, input, accessActor }),
  );
}
