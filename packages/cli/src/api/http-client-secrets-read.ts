import { authorizedJsonRequest } from "./http-client-metadata.js";
import type { ApiClient, ListEnvironmentSecretsData, ListSecretVersionsData } from "./types.js";

export async function listEnvironmentSecrets(
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

export async function listSecretVersions(
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
