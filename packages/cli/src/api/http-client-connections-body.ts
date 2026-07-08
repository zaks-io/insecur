import type { ConnectionsApiClient } from "./connections-api-types.js";

function assignOptionalField(body: Record<string, unknown>, field: string, value: unknown): void {
  if (value !== undefined) {
    body[field] = value;
  }
}

function encodeTokenUtf8(tokenUtf8: Uint8Array): string {
  return new TextDecoder().decode(tokenUtf8);
}

export function buildCreateAppConnectionBody(
  input: Parameters<ConnectionsApiClient["createAppConnection"]>[0],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    appConnectionId: input.appConnectionId,
    provider: input.provider,
    connectionMethod: input.connectionMethod,
    displayName: input.displayName,
  };
  assignOptionalField(body, "operationId", input.operationId);
  assignOptionalField(
    body,
    "tokenUtf8",
    input.tokenUtf8 === undefined ? undefined : encodeTokenUtf8(input.tokenUtf8),
  );
  assignOptionalField(body, "allowAccountId", input.allowAccountId);
  assignOptionalField(body, "allowWorkerScript", input.allowWorkerScript);
  assignOptionalField(body, "installationId", input.installationId);
  assignOptionalField(body, "owner", input.owner);
  assignOptionalField(body, "allowedRepositories", input.allowedRepositories);
  return body;
}

export function buildRotateAppConnectionBody(
  input: Parameters<ConnectionsApiClient["rotateAppConnectionCredential"]>[0],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    dryRun: input.dryRun,
  };
  assignOptionalField(body, "operationId", input.operationId);
  assignOptionalField(
    body,
    "tokenUtf8",
    input.tokenUtf8 === undefined ? undefined : encodeTokenUtf8(input.tokenUtf8),
  );
  return body;
}

export function buildReauthAppConnectionBody(
  input: Parameters<ConnectionsApiClient["reauthAppConnection"]>[0],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  assignOptionalField(body, "operationId", input.operationId);
  assignOptionalField(body, "installationId", input.installationId);
  assignOptionalField(body, "owner", input.owner);
  assignOptionalField(body, "allowedRepositories", input.allowedRepositories);
  return body;
}
