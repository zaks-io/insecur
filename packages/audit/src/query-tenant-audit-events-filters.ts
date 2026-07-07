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

function assertValidEventCodeFilter(eventCode: string | undefined): AuditEventCode | undefined {
  if (eventCode === undefined) {
    return undefined;
  }
  if (!isAuditEventCode(eventCode)) {
    throw invalidEventCodeError();
  }
  return eventCode;
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
    createdAtFrom: input.createdAtFrom,
    createdAtTo: input.createdAtTo,
  });
}
