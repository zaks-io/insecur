import { buildPersonalOrganizationRequestBody } from "./provision-request-body.js";
import type {
  ApiClient,
  CliSessionExchangeData,
  GuidedOrganizationProvisionData,
  SecretWriteByVariableKeyData,
} from "./types.js";
import {
  parseEnvelope,
  postAuthorizedJson,
  postJson,
  readCliCredentialHeader,
} from "./http-client-envelope.js";
import {
  consumeInjectionGrant,
  consumeInjectionGrantAll,
  issueInjectionGrant,
  recordInjectionRunCompleted,
} from "./http-client-runtime-injection.js";

export function createHttpApiClientForHost(host: string): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(base, input),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input),
    writeSecretByVariableKey: (input) => writeSecretByVariableKey(base, input),
    issueInjectionGrant: (input) => issueInjectionGrant(base, input),
    consumeInjectionGrant: (input) => consumeInjectionGrant(base, input),
    consumeInjectionGrantAll: (input) => consumeInjectionGrantAll(base, input),
    recordInjectionRunCompleted: (input) => recordInjectionRunCompleted(base, input),
  };
}

function createCliAuthorizationUrl(
  base: string,
  input: Parameters<ApiClient["createCliAuthorizationUrl"]>[0],
): string {
  const url = new URL("/v1/auth/cli/authorize", base);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
  return url.toString();
}

async function exchangeCliPkceSession(
  base: string,
  input: Parameters<ApiClient["exchangeCliPkceSession"]>[0],
) {
  const { response, body } = await postJson(new URL("/v1/auth/cli/pkce/exchange", base), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: input.code,
      codeVerifier: input.codeVerifier,
    }),
  });
  const envelope = parseEnvelope<CliSessionExchangeData>(body);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  const credential = readCliCredentialHeader(
    response,
    "CLI PKCE exchange succeeded but session credential header is missing",
  );
  return { ok: true as const, credential, envelope };
}

async function provisionPersonalOrganization(
  base: string,
  input: Parameters<ApiClient["provisionPersonalOrganization"]>[0],
) {
  const body = buildPersonalOrganizationRequestBody({
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
  });
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    "/v1/onboarding/personal-organization",
    input.bearerCredential,
    body,
  );
  const envelope = parseEnvelope<GuidedOrganizationProvisionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

async function writeSecretByVariableKey(
  base: string,
  input: Parameters<ApiClient["writeSecretByVariableKey"]>[0],
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
