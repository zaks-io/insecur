import type { RuntimeRpcResult } from "./runtime-rpc-contract.js";
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
} from "./runtime-connections-rpc-contract.js";

export interface RuntimeConnectionsRpc {
  listAppConnections(
    input: ListAppConnectionsRpcInput,
  ): Promise<RuntimeRpcResult<ListAppConnectionsRpcPayload>>;
  getAppConnectionStatus(
    input: GetAppConnectionStatusRpcInput,
  ): Promise<RuntimeRpcResult<GetAppConnectionStatusRpcPayload>>;
  createAppConnection(
    input: CreateAppConnectionRpcInput,
  ): Promise<RuntimeRpcResult<CreateAppConnectionRpcPayload>>;
  rotateAppConnectionCredential(
    input: RotateAppConnectionCredentialRpcInput,
  ): Promise<RuntimeRpcResult<RotateAppConnectionCredentialRpcPayload>>;
  reauthAppConnection(
    input: ReauthAppConnectionRpcInput,
  ): Promise<RuntimeRpcResult<ReauthAppConnectionRpcPayload>>;
  disconnectAppConnection(
    input: DisconnectAppConnectionRpcInput,
  ): Promise<RuntimeRpcResult<DisconnectAppConnectionRpcPayload>>;
}
