export interface ListAuditEventsQuery {
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

function buildAuditEventsQueryString(query: ListAuditEventsQuery): string {
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
  const queryString = params.toString();
  return queryString === "" ? "" : `?${queryString}`;
}

export async function fetchAuditEvents(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  organizationId: string,
  query: ListAuditEventsQuery = {},
): Promise<unknown> {
  const response = await apiFetch(
    `/v1/orgs/${encodeURIComponent(organizationId)}/audit-events${buildAuditEventsQueryString(query)}`,
  );
  return response.json();
}
