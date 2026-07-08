import { normalizeAuditTimestampFilter } from "@insecur/audit";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import type { ListAuditEventsFiltersInput } from "../api/types.js";
import { CliError } from "../output/cli-error.js";

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
  { source: "actorUserId", target: "actorUserId" },
  { source: "actorMachineIdentityId", target: "actorMachineIdentityId" },
  { source: "projectId", target: "projectId" },
  { source: "envId", target: "environmentId" },
  { source: "eventCode", target: "eventCode" },
];

function normalizeTimestampOption(optionName: "--from" | "--to", value: string): string {
  const normalized = normalizeAuditTimestampFilter(value);
  if (normalized === null) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message: `Invalid audit tail ${optionName} timestamp. Use YYYY-MM-DD or a UTC ISO 8601 timestamp.`,
      retryable: false,
    });
  }
  return normalized;
}

export function buildAuditTailFilters(
  commandOptions: AuditTailCommandOptions,
): ListAuditEventsFiltersInput | undefined {
  let filters: ListAuditEventsFiltersInput | undefined;
  if (commandOptions.from !== undefined) {
    filters = {
      ...filters,
      createdAtFrom: normalizeTimestampOption("--from", commandOptions.from),
    };
  }
  if (commandOptions.to !== undefined) {
    filters = {
      ...filters,
      createdAtTo: normalizeTimestampOption("--to", commandOptions.to),
    };
  }
  for (const mapping of AUDIT_TAIL_FILTER_MAPPINGS) {
    const value = commandOptions[mapping.source];
    if (value !== undefined) {
      filters = { ...filters, [mapping.target]: value };
    }
  }
  return filters;
}
