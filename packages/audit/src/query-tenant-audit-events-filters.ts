import {
  VALIDATION_ERROR_CODES,
  type EnvironmentId,
  type MachineIdentityId,
  type ProjectId,
  type UserId,
} from "@insecur/domain";
import type { AuditEventCode } from "./audit-event-codes.js";
import { isAuditEventCode } from "./audit-event-codes.js";
import type { ResolvedQueryTenantAuditEventsFilters } from "./query-tenant-audit-events-sql.js";
import { omitUndefinedFields } from "./optional-audit-fields.js";

export interface QueryTenantAuditEventsFilters {
  readonly actorUserId?: UserId;
  readonly actorMachineIdentityId?: MachineIdentityId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly eventCode?: string;
  readonly createdAtFrom?: string;
  readonly createdAtTo?: string;
}

function invalidEventCodeError(): Error & {
  code: typeof VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
} {
  return Object.assign(new Error("Invalid audit event code filter."), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}

function invalidTimestampFilterError(): Error & {
  code: typeof VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
} {
  return Object.assign(new Error("Invalid audit event timestamp filter."), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}

const DATE_ONLY_FILTER_PATTERN = /^(\d{4}-\d{2}-\d{2})$/;
const UTC_TIMESTAMP_FILTER_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;

function toValidIsoString(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function assertValidEventCodeFilter(eventCode: string | undefined): AuditEventCode | undefined {
  if (eventCode === undefined) {
    return undefined;
  }
  if (!isAuditEventCode(eventCode)) {
    throw invalidEventCodeError();
  }
  return eventCode;
}

function normalizeDateOnlyFilter(value: string): string | null {
  const dateOnly = DATE_ONLY_FILTER_PATTERN.exec(value);
  const datePart = dateOnly?.[1];
  if (datePart === undefined) {
    return null;
  }
  const expected = `${datePart}T00:00:00.000Z`;
  return toValidIsoString(expected) === expected ? expected : null;
}

function normalizeUtcTimestampFilter(value: string): string | null {
  const timestamp = UTC_TIMESTAMP_FILTER_PATTERN.exec(value);
  if (timestamp === null) {
    return null;
  }
  const timestampPart = timestamp[1];
  if (timestampPart === undefined) {
    return null;
  }
  const milliseconds = (timestamp[2] ?? "").padEnd(3, "0");
  const expected = `${timestampPart}.${milliseconds}Z`;
  return toValidIsoString(expected) === expected ? expected : null;
}

export function normalizeAuditTimestampFilter(value: string): string | null {
  return normalizeDateOnlyFilter(value) ?? normalizeUtcTimestampFilter(value);
}

function assertValidTimestampFilter(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeAuditTimestampFilter(value);
  if (normalized === null) {
    throw invalidTimestampFilterError();
  }
  return normalized;
}

export function resolveQueryTenantAuditEventsFilters(
  filters: QueryTenantAuditEventsFilters | undefined,
): ResolvedQueryTenantAuditEventsFilters {
  const input = filters ?? {};
  return omitUndefinedFields({
    actorUserId: input.actorUserId,
    actorMachineIdentityId: input.actorMachineIdentityId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    eventCode: assertValidEventCodeFilter(input.eventCode),
    createdAtFrom: assertValidTimestampFilter(input.createdAtFrom),
    createdAtTo: assertValidTimestampFilter(input.createdAtTo),
  });
}
