import { buildPersonalOrganizationRequestBody } from "./provision-request-body.js";
import { authorizedJsonRequest } from "./http-client-metadata.js";
import type {
  ApiClient,
  CliSessionExchangeData,
  CreateEnvironmentData,
  CreateProjectData,
  EnvironmentListData,
  GuidedOrganizationProvisionData,
  ListEnvironmentSecretsData,
  ListProjectSecretsData,
  ListSecretVersionsData,
  ProjectListData,
  SecretWriteByVariableKeyData,
  SessionOrganizationListData,
} from "./types.js";
import {
  parseEnvelope,
  postAuthorizedJson,
  postJson,
  readCliCredentialHeader,
} from "./http-client-envelope.js";
import { listAuditEvents } from "./http-client-audit-events.js";
import {
  consumeInjectionGrant,
  consumeInjectionGrantAll,
  issueInjectionGrant,
  recordInjectionRunCompleted,
} from "./http-client-runtime-injection.js";
import { cancelOperation, getOperation } from "./http-client-operations.js";

export function createHttpApiClientForHost(host: string): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(base, input),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input),
    writeSecretByVariableKey: (input) => writeSecretByVariableKey(base, input),
    listEnvironmentSecrets: (input) => listEnvironmentSecrets(base, input),
    listSecretVersions: (input) => listSecretVersions(base, input),
    issueInjectionGrant: (input) => issueInjectionGrant(base, input),
    consumeInjectionGrant: (input) => consumeInjectionGrant(base, input),
    consumeInjectionGrantAll: (input) => consumeInjectionGrantAll(base, input),
    recordInjectionRunCompleted: (input) => recordInjectionRunCompleted(base, input),
    listSessionOrganizations: (input) => listSessionOrganizations(base, input),
    listProjects: (input) => listProjects(base, input),
    createProject: (input) => createProject(base, input),
    listEnvironments: (input) => listEnvironments(base, input),
    listProjectSecrets: (input) => listProjectSecrets(base, input),
    createEnvironment: (input) => createEnvironment(base, input),
    listAuditEvents: (input) => listAuditEvents(base, input),
    getOperation: (input) => getOperation(base, input),
    cancelOperation: (input) => cancelOperation(base, input),
    revokeCliSession: (input) => revokeCliSession(base, input),
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

async function listSessionOrganizations(
  base: string,
  input: Parameters<ApiClient["listSessionOrganizations"]>[0],
) {
  return authorizedJsonRequest<SessionOrganizationListData>(
    base,
    "/v1/session/memberships",
    input.bearerCredential,
    { method: "GET" },
  );
}

async function listProjects(base: string, input: Parameters<ApiClient["listProjects"]>[0]) {
  return authorizedJsonRequest<ProjectListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects`,
    input.bearerCredential,
    { method: "GET" },
  );
}

async function createProject(base: string, input: Parameters<ApiClient["createProject"]>[0]) {
  return authorizedJsonRequest<CreateProjectData>(
    base,
    `/v1/orgs/${input.organizationId}/projects`,
    input.bearerCredential,
    {
      method: "POST",
      body: {
        projectId: input.projectId,
        displayName: input.displayName,
      },
    },
  );
}

async function listEnvironments(base: string, input: Parameters<ApiClient["listEnvironments"]>[0]) {
  return authorizedJsonRequest<EnvironmentListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments`,
    input.bearerCredential,
    { method: "GET" },
  );
}

async function listProjectSecrets(
  base: string,
  input: Parameters<ApiClient["listProjectSecrets"]>[0],
) {
  return authorizedJsonRequest<ListProjectSecretsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/secrets`,
    input.bearerCredential,
    { method: "GET" },
  );
}

async function listEnvironmentSecrets(
  base: string,
  input: Parameters<ApiClient["listEnvironmentSecrets"]>[0],
) {
  return authorizedJsonRequest<ListEnvironmentSecretsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets`,
    input.bearerCredential,
    { method: "GET" },
  );
}

async function listSecretVersions(
  base: string,
  input: Parameters<ApiClient["listSecretVersions"]>[0],
) {
  return authorizedJsonRequest<ListSecretVersionsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments/${input.environmentId}/secrets/${input.secretId}/versions`,
    input.bearerCredential,
    { method: "GET" },
  );
}

async function createEnvironment(
  base: string,
  input: Parameters<ApiClient["createEnvironment"]>[0],
) {
  const body: Record<string, unknown> = {
    environmentId: input.environmentId,
    displayName: input.displayName,
  };
  if (input.copyShapesFromEnvironmentId !== undefined) {
    body.copyShapesFromEnvironmentId = input.copyShapesFromEnvironmentId;
  }
  return authorizedJsonRequest<CreateEnvironmentData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments`,
    input.bearerCredential,
    { method: "POST", body },
  );
}

interface RevokeCliSessionData {
  readonly revoked: boolean;
}

async function revokeCliSession(base: string, input: Parameters<ApiClient["revokeCliSession"]>[0]) {
  const { response, body: responseBody } = await postAuthorizedJson(
    base,
    "/v1/session/revoke",
    input.bearerCredential,
    {},
  );
  const envelope = parseEnvelope<RevokeCliSessionData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
