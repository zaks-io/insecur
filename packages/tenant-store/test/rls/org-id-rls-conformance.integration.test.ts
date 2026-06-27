import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  assertOrgIdRlsConformance,
  findOrgIdRlsViolations,
  tenantOwnedTableNames,
  type TablePolicyRow,
  type TableRlsRow,
} from "../../src/db/schema/org-id-rls-conformance.js";
import { loadUserSchemaTables } from "../../src/db/schema/schema-tables.js";
import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { integrationDatabaseReady } from "./integration-database-ready.js";

if (process.env.INSECUR_CI_RLS_GATE === "1" && !integrationDatabaseReady) {
  throw new Error(
    "CI RLS gate requires DATABASE_URL_RUNTIME to be configured and Postgres to accept connections",
  );
}

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

async function readRlsState(databaseUrl: string): Promise<{
  rlsRows: TableRlsRow[];
  policyRows: TablePolicyRow[];
}> {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const rlsRows = await sql<TableRlsRow[]>`
      SELECT c.relname AS "tableName",
             c.relrowsecurity AS "rowSecurity",
             c.relforcerowsecurity AS "forceRowSecurity"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
    `;
    const policyRows = await sql<TablePolicyRow[]>`
      SELECT tablename AS "tableName", policyname AS "policyName"
      FROM pg_policies
      WHERE schemaname = 'public'
    `;
    return { rlsRows, policyRows };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describeIntegration("org_id table RLS coverage gate (fail-closed, drift-resistant)", () => {
  it("enforces FORCE ROW LEVEL SECURITY + an isolation policy on every tenant-owned table", async () => {
    const databaseUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
    const schemaTables = await loadUserSchemaTables();
    const { rlsRows, policyRows } = await readRlsState(databaseUrl);

    // Drives expectations from the Drizzle schema, so a future org_id table that ships without a
    // policy or FORCE flag fails here instead of silently shipping cross-tenant readable.
    expect(() => assertOrgIdRlsConformance(schemaTables, rlsRows, policyRows)).not.toThrow();
  });

  it("detects a tenant-owned table that loses FORCE RLS (negative control)", async () => {
    const databaseUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
    const schemaTables = await loadUserSchemaTables();
    const { rlsRows, policyRows } = await readRlsState(databaseUrl);

    const [firstTenantTable] = tenantOwnedTableNames(schemaTables);
    expect(firstTenantTable).toBeDefined();

    // Simulate drift: strip FORCE off one tenant table in the introspected snapshot and confirm the
    // gate flags it. This proves the check actually fails closed, not just that today's DB is clean.
    const driftedRls = rlsRows.map((row) =>
      row.tableName === firstTenantTable ? { ...row, forceRowSecurity: false } : row,
    );
    const violations = findOrgIdRlsViolations(schemaTables, driftedRls, policyRows);
    expect(violations).toContainEqual({
      tableName: firstTenantTable,
      reason: "force_row_security_disabled",
    });
  });
});
