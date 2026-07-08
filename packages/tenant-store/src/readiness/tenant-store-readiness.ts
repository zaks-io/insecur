import type { PgTable } from "drizzle-orm/pg-core";

import {
  findOrgIdRlsViolations,
  type OrgIdRlsViolation,
  type TablePolicyRow,
  type TableRlsRow,
} from "../db/schema/org-id-rls-conformance.js";

export type TenantStoreReadinessStatus = "ready" | "not_ready" | "unknown";

export type TenantStoreReadinessIssueCode =
  "runtime_role.bypasses_rls" | "tenant_table.rls_violation" | "probe.unreachable";

export interface TenantStoreReadinessIssue {
  readonly code: TenantStoreReadinessIssueCode;
  readonly tableName?: string;
  readonly rlsReason?: OrgIdRlsViolation["reason"];
}

export interface TenantStoreReadinessReport {
  readonly status: TenantStoreReadinessStatus;
  readonly issues: readonly TenantStoreReadinessIssue[];
  readonly runtimeRole?: string;
}

/** Minimal SQL surface for live tenant-store readiness probes (metadata-only). */
export interface TenantStoreReadinessSql {
  queryRuntimeRole(): Promise<{ roleName: string; bypassesRls: boolean } | null>;
  queryRlsRows(): Promise<readonly TableRlsRow[] | null>;
  queryPolicyRows(): Promise<readonly TablePolicyRow[] | null>;
}

export interface TenantStoreReadinessInput {
  readonly sql: TenantStoreReadinessSql;
  readonly schemaTables: readonly PgTable[];
}

function rlsViolationToIssue(violation: OrgIdRlsViolation): TenantStoreReadinessIssue {
  return {
    code: "tenant_table.rls_violation",
    tableName: violation.tableName,
    rlsReason: violation.reason,
  };
}

async function collectRuntimeRoleIssues(
  sql: TenantStoreReadinessSql,
): Promise<{ issues: TenantStoreReadinessIssue[]; runtimeRole?: string }> {
  try {
    const roleRow = await sql.queryRuntimeRole();
    if (roleRow === null) {
      return { issues: [{ code: "probe.unreachable" }] };
    }

    const issues: TenantStoreReadinessIssue[] = [];
    if (roleRow.bypassesRls) {
      issues.push({ code: "runtime_role.bypasses_rls" });
    }
    return { issues, runtimeRole: roleRow.roleName };
  } catch {
    return { issues: [{ code: "probe.unreachable" }] };
  }
}

async function collectRlsCoverageIssues(
  sql: TenantStoreReadinessSql,
  schemaTables: readonly PgTable[],
): Promise<TenantStoreReadinessIssue[]> {
  try {
    const rlsRows = await sql.queryRlsRows();
    const policyRows = await sql.queryPolicyRows();
    if (rlsRows === null || policyRows === null) {
      return [{ code: "probe.unreachable" }];
    }

    return findOrgIdRlsViolations(schemaTables, rlsRows, policyRows).map(rlsViolationToIssue);
  } catch {
    return [{ code: "probe.unreachable" }];
  }
}

function buildTenantStoreReadinessReport(
  issues: readonly TenantStoreReadinessIssue[],
  runtimeRole?: string,
): TenantStoreReadinessReport {
  const base = runtimeRole ? { runtimeRole } : {};
  if (issues.some((issue) => issue.code === "probe.unreachable")) {
    return { status: "unknown", issues, ...base };
  }

  return {
    status: issues.length === 0 ? "ready" : "not_ready",
    issues,
    ...base,
  };
}

/**
 * Metadata-only tenant-store readiness for the Storage Security Gate.
 * Proves active FORCE RLS on tenant-owned tables and a runtime role without BYPASSRLS.
 */
export async function checkTenantStoreReadiness(
  input: TenantStoreReadinessInput,
): Promise<TenantStoreReadinessReport> {
  const roleProbe = await collectRuntimeRoleIssues(input.sql);
  const rlsIssues = await collectRlsCoverageIssues(input.sql, input.schemaTables);
  return buildTenantStoreReadinessReport(
    [...roleProbe.issues, ...rlsIssues],
    roleProbe.runtimeRole,
  );
}
