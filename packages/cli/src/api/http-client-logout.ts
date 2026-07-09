import type { ApiClient } from "./types.js";
import {
  parseEnvelope,
  postAuthorizedJson,
  type HttpClientOptions,
} from "./http-client-envelope.js";

interface RevokeCliSessionData {
  readonly revoked: boolean;
}

export async function revokeCliSession(
  base: string,
  input: Parameters<ApiClient["revokeCliSession"]>[0],
  options?: HttpClientOptions,
) {
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    "/v1/session/revoke",
    input.bearerCredential,
    { body: {}, options },
  );
  const envelope = parseEnvelope<RevokeCliSessionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
