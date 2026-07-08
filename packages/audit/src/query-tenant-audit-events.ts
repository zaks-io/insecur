import { auditEventId, VALIDATION_ERROR_CODES, type OrganizationId } from "@insecur/domain";
import { toIsoTimestamp, withTenantScope, type TenantScopedSql } from "@insecur/tenant-store";
import type { AuditEventsPage, AuditEventRead } from "./audit-event-read.js";
import {
  encodeAuditEventsCursor,
  parseAuditEventsCursor,
} from "./query-tenant-audit-events-cursor.js";
import {
  resolveQueryTenantAuditEventsFilters,
  type QueryTenantAuditEventsFilters,
} from "./query-tenant-audit-events-filters.js";
import {
  toAuditEventReadFromRow,
  type AuditEventQueryRow,
} from "./query-tenant-audit-events-row.js";
import { queryAuditEventRows } from "./query-tenant-audit-events-sql.js";

export const AUDIT_EVENTS_DEFAULT_PAGE_SIZE = 25;
export const AUDIT_EVENTS_MAX_PAGE_SIZE = 100;

export type { QueryTenantAuditEventsFilters } from "./query-tenant-audit-events-filters.js";
export { normalizeAuditTimestampFilter } from "./query-tenant-audit-events-filters.js";
export { encodeAuditEventsCursor } from "./query-tenant-audit-events-cursor.js";

export interface QueryTenantAuditEventsInput {
  readonly organizationId: OrganizationId;
  readonly filters?: QueryTenantAuditEventsFilters;
  readonly pageSize?: number;
  readonly cursor?: string;
}

function invalidPageSizeError(): Error & {
  code: typeof VALIDATION_ERROR_CODES.invalidOpaqueResourceId;
} {
  return Object.assign(new Error("Invalid audit events page size."), {
    code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
  });
}

function normalizePageSize(pageSize: number | undefined): number {
  const resolved = pageSize ?? AUDIT_EVENTS_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > AUDIT_EVENTS_MAX_PAGE_SIZE) {
    throw invalidPageSizeError();
  }
  return resolved;
}

function toAuditEventsPage(rows: AuditEventQueryRow[], pageSize: number): AuditEventsPage {
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const events: AuditEventRead[] = pageRows.map((row) => toAuditEventReadFromRow(row));

  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow !== undefined
      ? encodeAuditEventsCursor({
          createdAt: toIsoTimestamp(lastRow.created_at),
          id: auditEventId.brand(lastRow.id),
        })
      : null;

  return { events, nextCursor };
}

/**
 * Tenant-scoped, filterable, cursor-paginated audit event query honoring forced RLS.
 */
export async function queryTenantAuditEvents(
  input: QueryTenantAuditEventsInput,
): Promise<AuditEventsPage> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => queryTenantAuditEventsInTenantScope(sql, input),
  );
}

export async function queryTenantAuditEventsInTenantScope(
  sql: TenantScopedSql,
  input: QueryTenantAuditEventsInput,
): Promise<AuditEventsPage> {
  const pageSize = normalizePageSize(input.pageSize);
  const filters = resolveQueryTenantAuditEventsFilters(input.filters);
  const cursor = input.cursor === undefined ? null : parseAuditEventsCursor(input.cursor);

  const rows = await queryAuditEventRows(sql, {
    organizationId: input.organizationId,
    filters,
    pageSize,
    cursor,
  });

  return toAuditEventsPage(rows, pageSize);
}
