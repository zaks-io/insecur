import type { ApiClient } from "./types.js";
import { getAuthorizedJson, parseEnvelope, postAuthorizedJson } from "./http-client-envelope.js";
import type { OperationCancelData, OperationPollData } from "./types.js";

export async function getOperation(base: string, input: Parameters<ApiClient["getOperation"]>[0]) {
  const path = `/v1/orgs/${input.organizationId}/operations/${input.operationId}`;
  const { response, body: responseBody } = await getAuthorizedJson(
    base,
    path,
    input.bearerCredential,
  );
  const envelope = parseEnvelope<OperationPollData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

export async function cancelOperation(
  base: string,
  input: Parameters<ApiClient["cancelOperation"]>[0],
) {
  const path = `/v1/orgs/${input.organizationId}/operations/${input.operationId}/cancel`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {},
  );
  const envelope = parseEnvelope<OperationCancelData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
