/** Shareable audit filter state carried in `/orgs/$orgId/audit` URL search params. */
export interface AuditSearchParams {
  actorUserId?: string;
  actorMachineIdentityId?: string;
  projectId?: string;
  environmentId?: string;
  eventCode?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  cursor?: string;
}

type AuditSearchFilterKey = Exclude<keyof AuditSearchParams, "cursor">;

const AUDIT_SEARCH_FILTER_KEYS: readonly AuditSearchFilterKey[] = [
  "actorUserId",
  "actorMachineIdentityId",
  "projectId",
  "environmentId",
  "eventCode",
  "createdAtFrom",
  "createdAtTo",
];

function pickSearchString(
  search: Record<string, unknown>,
  key: keyof AuditSearchParams,
): string | undefined {
  const value = search[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Normalize audit route search params from the URL. */
export function parseAuditSearch(search: Record<string, unknown>): AuditSearchParams {
  const parsed: AuditSearchParams = {};
  for (const key of [
    "actorUserId",
    "actorMachineIdentityId",
    "projectId",
    "environmentId",
    "eventCode",
    "createdAtFrom",
    "createdAtTo",
    "cursor",
  ] as const) {
    const value = pickSearchString(search, key);
    if (value !== undefined) {
      parsed[key] = value;
    }
  }
  return parsed;
}

/** API filter object for the tenant audit query route (cursor excluded). */
export function auditSearchToApiFilters(
  search: AuditSearchParams,
): Record<string, string> | undefined {
  let filters: Record<string, string> | undefined;
  for (const key of AUDIT_SEARCH_FILTER_KEYS) {
    const value = search[key];
    if (value !== undefined) {
      filters = { ...filters, [key]: value };
    }
  }
  return filters;
}

export function auditSearchHasActiveFilters(search: AuditSearchParams): boolean {
  return AUDIT_SEARCH_FILTER_KEYS.some((key) => search[key] !== undefined);
}

/** Build a query string fragment for audit navigation links. */
export function buildAuditSearchQuery(search: AuditSearchParams): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of [...AUDIT_SEARCH_FILTER_KEYS, "cursor"] as const) {
    const value = search[key];
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

/** Convert filter form values into shareable audit search params. */
export function auditSearchFromFormInput(input: {
  actorUserId: string;
  actorMachineIdentityId: string;
  projectId: string;
  environmentId: string;
  eventCode: string;
  createdAtFrom: string;
  createdAtTo: string;
}): AuditSearchParams {
  const nextSearch: AuditSearchParams = {};
  const assignTrimmed = (key: keyof AuditSearchParams, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed !== "") {
      nextSearch[key] = trimmed;
    }
  };
  assignTrimmed("actorUserId", input.actorUserId);
  assignTrimmed("actorMachineIdentityId", input.actorMachineIdentityId);
  assignTrimmed("projectId", input.projectId);
  assignTrimmed("environmentId", input.environmentId);
  assignTrimmed("eventCode", input.eventCode);
  const createdAtFromValue = datetimeLocalInputToIso(input.createdAtFrom);
  if (createdAtFromValue !== undefined) {
    nextSearch.createdAtFrom = createdAtFromValue;
  }
  const createdAtToValue = datetimeLocalInputToIso(input.createdAtTo);
  if (createdAtToValue !== undefined) {
    nextSearch.createdAtTo = createdAtToValue;
  }
  return nextSearch;
}

/** Convert an ISO timestamp to `datetime-local` input value when possible. */
export function isoToDatetimeLocalInput(iso: string | undefined): string {
  if (iso === undefined) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(date.getUTCFullYear())}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Convert a `datetime-local` value to an ISO timestamp for the audit API. */
export function datetimeLocalInputToIso(local: string): string | undefined {
  const trimmed = local.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = new Date(`${trimmed}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}
