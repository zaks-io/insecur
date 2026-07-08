import { authHeaders } from "./auth";
import type { PreviewConfig } from "./env";
import { assertEnvelopeData, getJson, postJson, requireString } from "./http";

/** Workspace coordinates discovered or provisioned for preview smoke console walks. */
export interface SmokeWorkspaceFixture {
  readonly displayName: string;
  readonly environmentId?: string;
  readonly organizationId: string;
  readonly projectDisplayName?: string;
  readonly projectId?: string;
}

interface ConsoleOrganization {
  readonly displayName: string;
  readonly organizationId: string;
}

interface ConsoleProject {
  readonly displayName: string;
  readonly projectId: string;
}

/**
 * Resolve a stable owner workspace for authenticated console smoke. Reuses an existing membership
 * when preview already has one; otherwise provisions through Guided Organization Provisioning,
 * matching the first-value smoke pattern.
 */
export async function ensureOwnerWorkspaceFixture(
  preview: PreviewConfig,
  bearer: string,
): Promise<SmokeWorkspaceFixture> {
  const memberships = await loadMemberships(preview, bearer);
  const organization = memberships[0] ?? (await provisionPersonalOrganization(preview, bearer));
  const projects = await loadProjects(preview, bearer, organization.organizationId);
  const project = projects[0];
  if (project === undefined) {
    return organization;
  }

  const environments = await loadEnvironments(
    preview,
    bearer,
    organization.organizationId,
    project.projectId,
  );
  const environment = environments[0];

  return {
    ...organization,
    projectDisplayName: project.displayName,
    projectId: project.projectId,
    ...(environment === undefined ? {} : { environmentId: environment.environmentId }),
  };
}

/** Membership organizations for the smoke owner, ordered like the console default-org resolver. */
export async function loadMemberships(
  preview: PreviewConfig,
  bearer: string,
): Promise<readonly ConsoleOrganization[]> {
  const body = await getJson(
    `${preview.apiBaseUrl}/v1/session/memberships`,
    "Session memberships",
    {
      headers: authHeaders(bearer),
    },
  );
  const data = assertEnvelopeData(body, "Session memberships");
  const organizations = data.organizations;
  if (!Array.isArray(organizations)) {
    throw new Error("Session memberships data.organizations must be an array");
  }

  const parsed: ConsoleOrganization[] = [];
  for (const entry of organizations) {
    const organization = parseOrganization(entry);
    if (organization !== undefined) {
      parsed.push(organization);
    }
  }
  return parsed;
}

async function provisionPersonalOrganization(
  preview: PreviewConfig,
  bearer: string,
): Promise<ConsoleOrganization> {
  const body = await postJson({
    bearer,
    body: {},
    label: "Guided onboarding",
    url: `${preview.apiBaseUrl}/v1/onboarding/personal-organization`,
  });
  const data = assertEnvelopeData(body, "Guided onboarding");
  const organizationId = requireString(data.organizationId, "onboarding organizationId");
  const memberships = await loadMemberships(preview, bearer);
  const organization = memberships.find((entry) => entry.organizationId === organizationId);
  if (organization !== undefined) {
    return organization;
  }
  return {
    displayName: organizationId,
    organizationId,
  };
}

async function loadProjects(
  preview: PreviewConfig,
  bearer: string,
  organizationId: string,
): Promise<readonly ConsoleProject[]> {
  const body = await getJson(
    `${preview.apiBaseUrl}/v1/orgs/${organizationId}/projects`,
    "Project list",
    { headers: authHeaders(bearer) },
  );
  const data = assertEnvelopeData(body, "Project list");
  const projects = data.projects;
  if (!Array.isArray(projects)) {
    throw new Error("Project list data.projects must be an array");
  }

  const parsed: ConsoleProject[] = [];
  for (const entry of projects) {
    const project = parseProject(entry);
    if (project !== undefined) {
      parsed.push(project);
    }
  }
  return parsed;
}

async function loadEnvironments(
  preview: PreviewConfig,
  bearer: string,
  organizationId: string,
  projectId: string,
): Promise<readonly { environmentId: string }[]> {
  const body = await getJson(
    `${preview.apiBaseUrl}/v1/orgs/${organizationId}/projects/${projectId}/environments`,
    "Environment list",
    { headers: authHeaders(bearer) },
  );
  const data = assertEnvelopeData(body, "Environment list");
  const environments = data.environments;
  if (!Array.isArray(environments)) {
    throw new Error("Environment list data.environments must be an array");
  }

  const parsed: { environmentId: string }[] = [];
  for (const entry of environments) {
    const environmentId = parseEnvironmentId(entry);
    if (environmentId !== undefined) {
      parsed.push({ environmentId });
    }
  }
  return parsed;
}

function parseOrganization(entry: unknown): ConsoleOrganization | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const organizationId = record.organizationId;
  const displayName = record.displayName;
  if (typeof organizationId !== "string" || typeof displayName !== "string") {
    return undefined;
  }
  return { displayName, organizationId };
}

function parseProject(entry: unknown): ConsoleProject | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const projectId = record.projectId;
  const displayName = record.displayName;
  if (typeof projectId !== "string" || typeof displayName !== "string") {
    return undefined;
  }
  return { displayName, projectId };
}

function parseEnvironmentId(entry: unknown): string | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const environmentId = (entry as Record<string, unknown>).environmentId;
  return typeof environmentId === "string" ? environmentId : undefined;
}
