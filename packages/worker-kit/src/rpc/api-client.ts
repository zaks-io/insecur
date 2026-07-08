import { INSECUR_API_TOKEN_AUDIENCE, mintScopedAccessToken, type UserActor } from "@insecur/auth";

/**
 * Bindings the Web BFF needs to reach the public API Worker over its private Service Binding
 * (ADR-0051). The browser never sees the minted bearer; it stays server-side on the hop.
 */
export interface ApiClientEnv {
  readonly API: Fetcher;
  readonly SESSION_SIGNING_SECRET: string;
}

const API_ORIGIN = "https://insecur-api.internal";

interface OrgAuditEventsQuery {
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly filters?: {
    readonly actorUserId?: string;
    readonly actorMachineIdentityId?: string;
    readonly projectId?: string;
    readonly environmentId?: string;
    readonly eventCode?: string;
    readonly createdAtFrom?: string;
    readonly createdAtTo?: string;
  };
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

function auditEventsPath(organizationId: string, query: OrgAuditEventsQuery = {}): string {
  const params = new URLSearchParams();
  if (query.pageSize !== undefined) {
    params.set("pageSize", String(query.pageSize));
  }
  if (query.cursor !== undefined) {
    params.set("cursor", query.cursor);
  }
  const filters = query.filters;
  if (filters !== undefined) {
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === "string") {
        params.set(key, value);
      }
    }
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return `/v1/orgs/${encodeURIComponent(organizationId)}/audit-events${suffix}`;
}

function createSessionApiMethods(apiFetch: ApiFetch) {
  return {
    whoami: async (): Promise<unknown> => {
      const response = await apiFetch("/v1/session/whoami");
      return response.json();
    },
    sessionMemberships: async (): Promise<unknown> => {
      const response = await apiFetch("/v1/session/memberships");
      return response.json();
    },
  };
}

function createOrgApiMethods(apiFetch: ApiFetch) {
  return {
    orgProjects: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(`/v1/orgs/${encodeURIComponent(organizationId)}/projects`);
      return response.json();
    },
    projectEnvironments: async (organizationId: string, projectId: string): Promise<unknown> => {
      const response = await apiFetch(
        `/v1/orgs/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/environments`,
      );
      return response.json();
    },
    orgMembers: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(`/v1/orgs/${encodeURIComponent(organizationId)}/members`);
      return response.json();
    },
    orgInvitations: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(`/v1/orgs/${encodeURIComponent(organizationId)}/invitations`);
      return response.json();
    },
    orgAuditEvents: async (
      organizationId: string,
      query: OrgAuditEventsQuery = {},
    ): Promise<unknown> => {
      const response = await apiFetch(auditEventsPath(organizationId, query));
      return response.json();
    },
    orgHighAssuranceChallenges: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(
        `/v1/orgs/${encodeURIComponent(organizationId)}/high-assurance-challenges`,
      );
      return response.json();
    },
  };
}

function createOnboardingApiMethods(apiFetch: ApiFetch) {
  return {
    provisionPersonalOrganization: async (body: Record<string, unknown>): Promise<unknown> => {
      const response = await apiFetch("/v1/onboarding/personal-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.json();
    },
    writeSecretByVariableKey: async (
      organizationId: string,
      projectId: string,
      environmentId: string,
      body: Record<string, unknown>,
    ): Promise<unknown> => {
      const response = await apiFetch(
        `/v1/orgs/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(environmentId)}/secrets/by-variable-key`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return response.json();
    },
    firstValueUsage: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(
        `/v1/orgs/${encodeURIComponent(organizationId)}/first-value-usage`,
      );
      return response.json();
    },
  };
}

/**
 * Mint-once, call the API Worker over the private binding with a short-TTL `insecur-api`-audience
 * scoped token (ADR-0051/0077). Mirrors {@link runtimeClientFor} on the API→Runtime seam.
 */
export function apiClientFor(env: ApiClientEnv, actor: UserActor) {
  let tokenPromise: Promise<string> | undefined;
  const authorizationHeader = (): Promise<string> =>
    (tokenPromise ??= mintScopedAccessToken({
      actor,
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret: env.SESSION_SIGNING_SECRET,
    }).then((minted) => `Bearer ${minted.token}`));

  const apiFetch: ApiFetch = async (path, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", await authorizationHeader());
    return env.API.fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  };

  return {
    ...createSessionApiMethods(apiFetch),
    ...createOrgApiMethods(apiFetch),
    ...createOnboardingApiMethods(apiFetch),
  };
}
