import { INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import { buildPersonalOrganizationRequestBody } from "./provision-request-body.js";
import type {
  ApiClient,
  CliSessionExchangeData,
  GuidedOrganizationProvisionData,
  InjectionGrantDeliveryEnvelope,
  IssueInjectionGrantData,
  SecretWriteByVariableKeyData,
} from "./types.js";

async function readJsonResponse(response: Response): Promise<unknown> {
  return response.json();
}

function parseEnvelope<T>(body: unknown): SuccessEnvelope<T> | ErrorEnvelope {
  if (body === null || typeof body !== "object") {
    throw new Error("API response is not a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === true) {
    return body as SuccessEnvelope<T>;
  }
  if (record.ok === false) {
    return body as ErrorEnvelope;
  }
  throw new Error("API response missing ok field");
}

function parseDeliveryEnvelope(body: unknown): InjectionGrantDeliveryEnvelope | ErrorEnvelope {
  if (body === null || typeof body !== "object") {
    throw new Error("API response is not a JSON object");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === true && record.delivery !== undefined) {
    return body as InjectionGrantDeliveryEnvelope;
  }
  if (record.ok === false) {
    return body as ErrorEnvelope;
  }
  throw new Error("API delivery response missing ok/delivery fields");
}

function readCliCredentialHeader(response: Response, missingMessage: string): string {
  const credential = response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER);
  if (credential === null || credential === "") {
    throw new Error(missingMessage);
  }
  return credential;
}

async function postJson(
  url: URL,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, init);
  return { response, body: await readJsonResponse(response) };
}

async function postAuthorizedJson(
  base: string,
  path: string,
  bearerCredential: string,
  body: unknown,
): Promise<{ response: Response; body: unknown }> {
  return postJson(new URL(path, base), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerCredential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export function createHttpApiClientForHost(host: string): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(base, input),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input),
    writeSecretByVariableKey: (input) => writeSecretByVariableKey(base, input),
    issueInjectionGrant: (input) => issueInjectionGrant(base, input),
    consumeInjectionGrant: (input) => consumeInjectionGrant(base, input),
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

async function issueInjectionGrant(
  base: string,
  input: Parameters<ApiClient["issueInjectionGrant"]>[0],
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      variableKey: input.variableKey,
    },
  );
  const envelope = parseEnvelope<IssueInjectionGrantData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}

async function consumeInjectionGrant(
  base: string,
  input: Parameters<ApiClient["consumeInjectionGrant"]>[0],
) {
  const path = `/v1/orgs/${input.organizationId}/runtime-injection/grants/${input.grantId}/consume`;
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    path,
    input.bearerCredential,
    {
      organizationId: input.organizationId,
      variableKey: input.variableKey,
    },
  );
  const envelope = parseDeliveryEnvelope(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
