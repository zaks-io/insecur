import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * The column that marks a table as tenant-owned. Every table carrying it must be protected by
 * FORCE ROW LEVEL SECURITY plus a tenant-isolation policy, or a cross-tenant read/write is possible
 * on any code path that relies on RLS as the backstop (raw or unfiltered queries) rather than the
 * application `org_id` predicate. `organizations` is tenant-owned too, but keys on its own `id`.
 */
const TENANT_KEY_COLUMN = "org_id";
const SELF_KEYED_TENANT_TABLE = "organizations";

/** Live `pg_class` row for a public table's RLS flags. */
export interface TableRlsRow {
  readonly tableName: string;
  readonly rowSecurity: boolean;
  readonly forceRowSecurity: boolean;
}

/** Live `pg_policies` row (one per policy on a public table). */
export interface TablePolicyRow {
  readonly tableName: string;
  readonly policyName: string;
}

/** A single way a tenant-owned table fails the RLS coverage contract. */
export interface OrgIdRlsViolation {
  readonly tableName: string;
  readonly reason:
    | "row_security_disabled"
    | "force_row_security_disabled"
    | "no_isolation_policy"
    | "table_absent_from_database";
}

/** True when a Drizzle table is tenant-owned (has `org_id`, or is `organizations` itself). */
export function isTenantOwnedTable(table: PgTable): boolean {
  if (getTableName(table) === SELF_KEYED_TENANT_TABLE) {
    return true;
  }
  return Object.values(getTableColumns(table)).some((column) => column.name === TENANT_KEY_COLUMN);
}

/** The tenant-owned table names declared by the Drizzle schema, sorted. */
export function tenantOwnedTableNames(tables: readonly PgTable[]): readonly string[] {
  return tables
    .filter(isTenantOwnedTable)
    .map((table) => getTableName(table))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Computes every tenant-owned table that is not fully protected by FORCE RLS plus an isolation
 * policy in the live database. Drives expectations from the Drizzle schema (not a hardcoded list)
 * so a newly added `org_id` table that ships without a policy or FORCE flag is caught, rather than
 * silently shipping cross-tenant readable. An empty result means full coverage.
 */
export function findOrgIdRlsViolations(
  schemaTables: readonly PgTable[],
  rlsRows: readonly TableRlsRow[],
  policyRows: readonly TablePolicyRow[],
): readonly OrgIdRlsViolation[] {
  const rlsByTable = new Map(rlsRows.map((row) => [row.tableName, row]));
  const policiesByTable = new Set(policyRows.map((row) => row.tableName));

  const violations: OrgIdRlsViolation[] = [];
  for (const tableName of tenantOwnedTableNames(schemaTables)) {
    const rls = rlsByTable.get(tableName);
    if (rls === undefined) {
      violations.push({ tableName, reason: "table_absent_from_database" });
      continue;
    }
    if (!rls.rowSecurity) {
      violations.push({ tableName, reason: "row_security_disabled" });
    }
    if (!rls.forceRowSecurity) {
      violations.push({ tableName, reason: "force_row_security_disabled" });
    }
    if (!policiesByTable.has(tableName)) {
      violations.push({ tableName, reason: "no_isolation_policy" });
    }
  }
  return violations;
}

/** Fails closed (throws) when any tenant-owned table lacks FORCE RLS or an isolation policy. */
export function assertOrgIdRlsConformance(
  schemaTables: readonly PgTable[],
  rlsRows: readonly TableRlsRow[],
  policyRows: readonly TablePolicyRow[],
): void {
  const violations = findOrgIdRlsViolations(schemaTables, rlsRows, policyRows);
  if (violations.length === 0) {
    return;
  }
  const detail = violations.map((v) => `${v.tableName}: ${v.reason}`).join("; ");
  throw new Error(
    `tenant-owned tables missing RLS coverage (FORCE ROW LEVEL SECURITY + isolation policy): ${detail}`,
  );
}
