import { authorizedJsonRequest } from "./http-client-metadata.js";
import type { HttpClientOptions } from "./http-client-envelope.js";
import {
  buildCreateAppConnectionBody,
  buildReauthAppConnectionBody,
  buildRotateAppConnectionBody,
} from "./http-client-connections-body.js";
import type {
  ConnectionsApiClient,
  CreateAppConnectionData,
  DisconnectAppConnectionData,
  GetAppConnectionStatusData,
  ListAppConnectionsData,
  ReauthAppConnectionData,
  RotateAppConnectionCredentialData,
} from "./connections-api-types.js";

export async function listAppConnections(
  base: string,
  input: Parameters<ConnectionsApiClient["listAppConnections"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<ListAppConnectionsData>(
    base,
    `/v1/orgs/${input.organizationId}/connections`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function getAppConnectionStatus(
  base: string,
  input: Parameters<ConnectionsApiClient["getAppConnectionStatus"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<GetAppConnectionStatusData>(
    base,
    `/v1/orgs/${input.organizationId}/connections/${input.appConnectionId}`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function createAppConnection(
  base: string,
  input: Parameters<ConnectionsApiClient["createAppConnection"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<CreateAppConnectionData>(
    base,
    `/v1/orgs/${input.organizationId}/connections`,
    input.bearerCredential,
    { method: "POST", body: buildCreateAppConnectionBody(input), options },
  );
}

export async function rotateAppConnectionCredential(
  base: string,
  input: Parameters<ConnectionsApiClient["rotateAppConnectionCredential"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<RotateAppConnectionCredentialData>(
    base,
    `/v1/orgs/${input.organizationId}/connections/${input.appConnectionId}/rotate`,
    input.bearerCredential,
    { method: "POST", body: buildRotateAppConnectionBody(input), options },
  );
}

export async function reauthAppConnection(
  base: string,
  input: Parameters<ConnectionsApiClient["reauthAppConnection"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<ReauthAppConnectionData>(
    base,
    `/v1/orgs/${input.organizationId}/connections/${input.appConnectionId}/reauth`,
    input.bearerCredential,
    { method: "POST", body: buildReauthAppConnectionBody(input), options },
  );
}

export async function disconnectAppConnection(
  base: string,
  input: Parameters<ConnectionsApiClient["disconnectAppConnection"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<DisconnectAppConnectionData>(
    base,
    `/v1/orgs/${input.organizationId}/connections/${input.appConnectionId}/disconnect`,
    input.bearerCredential,
    { method: "POST", body: {}, options },
  );
}
