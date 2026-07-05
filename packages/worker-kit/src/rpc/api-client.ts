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

  async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", await authorizationHeader());
    return env.API.fetch(`${API_ORIGIN}${path}`, { ...init, headers });
  }

  return {
    whoami: async (): Promise<unknown> => {
      const response = await apiFetch("/v1/session/whoami");
      return response.json();
    },
    sessionMemberships: async (): Promise<unknown> => {
      const response = await apiFetch("/v1/session/memberships");
      return response.json();
    },
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
  };
}
