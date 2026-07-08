import type { SecretWriteByVariableKeyData, SecretsApiClient } from "./secrets-api-types.js";
import { parseEnvelope, postAuthorizedJson } from "./http-client-envelope.js";

export async function writeSecretByVariableKey(
  base: string,
  input: Parameters<SecretsApiClient["writeSecretByVariableKey"]>[0],
) {
  const path = `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets/by-variable-key`;
  const body: Record<string, unknown> = {
    variableKey: input.variableKey,
  };
  if ("valueUtf8" in input) {
    body.value = new TextDecoder("utf-8", { fatal: true }).decode(input.valueUtf8);
  } else {
    body.generate = input.generate;
  }
  if (input.allowEmpty === true) {
    body.allowEmpty = true;
  }
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    body,
  );
  const envelope = parseEnvelope<SecretWriteByVariableKeyData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
