import type { NavigationApiClient } from "./navigation-api-types.js";
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
) {
  return authorizedJsonRequest<SessionOrganizationListData>(
    base,
    "/v1/session/memberships",
    input.bearerCredential,
    { method: "GET" },
  );
}

export async function listProjects(
  base: string,
  input: Parameters<NavigationApiClient["listProjects"]>[0],
) {
  return authorizedJsonRequest<ProjectListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects`,
    input.bearerCredential,
    { method: "GET" },
  );
}

export async function createProject(
  base: string,
  input: Parameters<NavigationApiClient["createProject"]>[0],
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
    },
  );
}

export async function listEnvironments(
  base: string,
  input: Parameters<NavigationApiClient["listEnvironments"]>[0],
) {
  return authorizedJsonRequest<EnvironmentListData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/environments`,
    input.bearerCredential,
    { method: "GET" },
  );
}

export async function listProjectSecrets(
  base: string,
  input: Parameters<NavigationApiClient["listProjectSecrets"]>[0],
) {
  return authorizedJsonRequest<ListProjectSecretsData>(
    base,
    `/v1/orgs/${input.organizationId}/projects/${input.projectId}/secrets`,
    input.bearerCredential,
    { method: "GET" },
  );
}

export async function createEnvironment(
  base: string,
  input: Parameters<NavigationApiClient["createEnvironment"]>[0],
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
