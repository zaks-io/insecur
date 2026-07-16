import type {
  CheckSecretPossessionData,
  SecretWriteByVariableKeyData,
  SecretsApiClient,
} from "./secrets-api-types.js";
import {
  parseEnvelope,
  postAuthorizedJson,
  type HttpClientOptions,
} from "./http-client-envelope.js";

function buildSecretWriteBody(
  input: Parameters<SecretsApiClient["writeSecretByVariableKey"]>[0],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    variableKey: input.variableKey,
  };
  if ("valueUtf8" in input) {
    body.value = new TextDecoder("utf-8", { fatal: true }).decode(input.valueUtf8);
  } else {
    body.generate = input.generate;
  }
  if (input.secretId !== undefined) {
    body.secretId = input.secretId;
  }
  if (input.allowEmpty === true) {
    body.allowEmpty = true;
  }
  if (input.createOnly === true) {
    body.createOnly = true;
  }
  return body;
}

export async function writeSecretByVariableKey(
  base: string,
  input: Parameters<SecretsApiClient["writeSecretByVariableKey"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets/by-variable-key`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    { body: buildSecretWriteBody(input), options },
  );
  const envelope = parseEnvelope<SecretWriteByVariableKeyData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

/**
 * Server-side possession check (INS-403). The candidate value is sent only as the request body of
 * this call — the migrate-approved plaintext egress — and the response is metadata-only.
 */
export async function checkSecretPossession(
  base: string,
  input: Parameters<SecretsApiClient["checkSecretPossession"]>[0],
  options?: HttpClientOptions,
) {
  const path = `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets/possession-check`;
  const body: Record<string, unknown> = {
    variableKey: input.variableKey,
    value: new TextDecoder("utf-8", { fatal: true }).decode(input.candidateUtf8),
  };
  if (input.secretId !== undefined) {
    body.secretId = input.secretId;
  }
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    { body, options },
  );
  const envelope = parseEnvelope<CheckSecretPossessionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
