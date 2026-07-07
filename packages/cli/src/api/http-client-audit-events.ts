import type { ListAuditEventsFiltersInput } from "./types.js";
import { getAuthorizedJson, parseEnvelope } from "./http-client-envelope.js";
import type { ApiClient, ListAuditEventsData } from "./types.js";

const AUDIT_EVENT_FILTER_PARAMS: readonly (keyof ListAuditEventsFiltersInput)[] = [
  "actorUserId",
  "actorMachineIdentityId",
  "projectId",
  "environmentId",
  "eventCode",
  "createdAtFrom",
  "createdAtTo",
];

function buildAuditEventsQueryString(input: {
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly filters?: ListAuditEventsFiltersInput;
}): string {
  const params = new URLSearchParams();
  if (input.pageSize !== undefined) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.cursor !== undefined) {
    params.set("cursor", input.cursor);
  }
  const filters = input.filters;
  if (filters !== undefined) {
    for (const key of AUDIT_EVENT_FILTER_PARAMS) {
      const value = filters[key];
      if (value !== undefined) {
        params.set(key, value);
      }
    }
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export async function listAuditEvents(
  base: string,
  input: Parameters<ApiClient["listAuditEvents"]>[0],
) {
  const path =
    `/v1/orgs/${input.organizationId}/audit-events` +
    buildAuditEventsQueryString({
      ...(input.pageSize === undefined ? {} : { pageSize: input.pageSize }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      ...(input.filters === undefined ? {} : { filters: input.filters }),
    });
  const { response, body: responseBody } = await getAuthorizedJson(
    base,
    path,
    input.bearerCredential,
  );
  const envelope = parseEnvelope<ListAuditEventsData>(responseBody);
  if (!envelope.ok) {
    return { ok: false as const, envelope, httpStatus: response.status };
  }
  return { ok: true as const, envelope };
}
