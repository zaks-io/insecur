import type { NavigationApiClient } from "./navigation-api-types.js";
import type { HttpClientOptions } from "./http-client-envelope.js";
import type {
  CreateEnvironmentData,
  CreateProjectData,
  EnvironmentListData,
  ListProjectSecretsData,
  ProjectListData,
  SessionOrganizationListData,
} from "./navigation-api-types.js";
import { authorizedJsonRequest } from "./http-client-metadata.js";

export async function listSessionOrganizations(
  base: string,
  input: Parameters<NavigationApiClient["listSessionOrganizations"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<SessionOrganizationListData>(
    base,
    "/v1/session/memberships",
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function listProjects(
  base: string,
  input: Parameters<NavigationApiClient["listProjects"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<ProjectListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function createProject(
  base: string,
  input: Parameters<NavigationApiClient["createProject"]>[0],
  options?: HttpClientOptions,
) {
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
      options,
    },
  );
}

export async function listEnvironments(
  base: string,
  input: Parameters<NavigationApiClient["listEnvironments"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<EnvironmentListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function listProjectSecrets(
  base: string,
  input: Parameters<NavigationApiClient["listProjectSecrets"]>[0],
  options?: HttpClientOptions,
) {
  return authorizedJsonRequest<ListProjectSecretsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/secrets`,
    input.bearerCredential,
    { method: "GET", options },
  );
}

export async function createEnvironment(
  base: string,
  input: Parameters<NavigationApiClient["createEnvironment"]>[0],
  options?: HttpClientOptions,
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
    { method: "POST", body, options },
  );
}
