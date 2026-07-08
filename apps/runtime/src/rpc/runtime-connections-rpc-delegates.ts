import type {
  CreateAppConnectionRpcInput,
  CreateAppConnectionRpcPayload,
  DisconnectAppConnectionRpcInput,
  DisconnectAppConnectionRpcPayload,
  GetAppConnectionStatusRpcInput,
  GetAppConnectionStatusRpcPayload,
  ListAppConnectionsRpcInput,
  ListAppConnectionsRpcPayload,
  ReauthAppConnectionRpcInput,
  ReauthAppConnectionRpcPayload,
  RotateAppConnectionCredentialRpcInput,
  RotateAppConnectionCredentialRpcPayload,
} from "@insecur/worker-kit/rpc/runtime-connections-rpc-contract";
import type { RuntimeRpcResult } from "@insecur/worker-kit";

import {
  createAppConnectionOperation,
  disconnectAppConnectionOperation,
  getAppConnectionStatusOperation,
  listAppConnectionsOperation,
  reauthAppConnectionOperation,
  rotateAppConnectionCredentialOperation,
} from "../operations/app-connection-operations.js";
import type { RuntimeEnv } from "../env.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function listAppConnectionsRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ListAppConnectionsRpcInput,
): Promise<RuntimeRpcResult<ListAppConnectionsRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    listAppConnectionsOperation({ env, input, auditActor, accessActor }),
  );
}

export function getAppConnectionStatusRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: GetAppConnectionStatusRpcInput,
): Promise<RuntimeRpcResult<GetAppConnectionStatusRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    getAppConnectionStatusOperation({ env, input, auditActor, accessActor }),
  );
}

export function createAppConnectionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: CreateAppConnectionRpcInput,
): Promise<RuntimeRpcResult<CreateAppConnectionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    createAppConnectionOperation({ env, input, auditActor, accessActor }),
  );
}

export function rotateAppConnectionCredentialRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: RotateAppConnectionCredentialRpcInput,
): Promise<RuntimeRpcResult<RotateAppConnectionCredentialRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    rotateAppConnectionCredentialOperation({ env, input, auditActor, accessActor }),
  );
}

export function reauthAppConnectionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: ReauthAppConnectionRpcInput,
): Promise<RuntimeRpcResult<ReauthAppConnectionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    reauthAppConnectionOperation({ env, input, auditActor, accessActor }),
  );
}

export function disconnectAppConnectionRpc(
  post: PostAuthRpcRunner,
  env: RuntimeEnv,
  input: DisconnectAppConnectionRpcInput,
): Promise<RuntimeRpcResult<DisconnectAppConnectionRpcPayload>> {
  return post(input.actorToken, ({ auditActor, accessActor }) =>
    disconnectAppConnectionOperation({ env, input, auditActor, accessActor }),
  );
}
