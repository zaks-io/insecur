import type { ListAuditEventsFiltersInput } from "../api/types.js";

export interface AuditTailCommandOptions {
  readonly limit?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly actorUserId?: string;
  readonly actorMachineIdentityId?: string;
  readonly projectId?: string;
  readonly envId?: string;
  readonly eventCode?: string;
}

const AUDIT_TAIL_FILTER_MAPPINGS: readonly {
  readonly source: keyof AuditTailCommandOptions;
  readonly target: keyof ListAuditEventsFiltersInput;
}[] = [
  { source: "from", target: "createdAtFrom" },
  { source: "to", target: "createdAtTo" },
  { source: "actorUserId", target: "actorUserId" },
  { source: "actorMachineIdentityId", target: "actorMachineIdentityId" },
  { source: "projectId", target: "projectId" },
  { source: "envId", target: "environmentId" },
  { source: "eventCode", target: "eventCode" },
];

export function buildAuditTailFilters(
  commandOptions: AuditTailCommandOptions,
): ListAuditEventsFiltersInput | undefined {
  let filters: ListAuditEventsFiltersInput | undefined;
  for (const mapping of AUDIT_TAIL_FILTER_MAPPINGS) {
    const value = commandOptions[mapping.source];
    if (value !== undefined) {
      filters = { ...filters, [mapping.target]: value };
    }
  }
  return filters;
}
