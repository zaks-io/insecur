import { describe, expect, it } from "vitest";

import {
  checkTenantStoreReadiness,
  type TenantStoreReadinessSql,
} from "../src/readiness/tenant-store-readiness.js";
import {
  tenantOwnedTableNames,
  type TablePolicyRow,
  type TableRlsRow,
} from "../src/db/schema/org-id-rls-conformance.js";
import { loadUserSchemaTables } from "../src/db/schema/schema-tables.js";

function createSqlStub(input: {
  role?: { roleName: string; bypassesRls: boolean } | null;
  rlsRows?: readonly TableRlsRow[] | null;
  policyRows?: readonly TablePolicyRow[] | null;
  throwOnRole?: boolean;
}): TenantStoreReadinessSql {
  return {
    queryRuntimeRole: () => {
      if (input.throwOnRole) {
        return Promise.reject(new Error("role query failed"));
      }
      return Promise.resolve(input.role ?? null);
    },
    queryRlsRows: () => Promise.resolve(input.rlsRows ?? null),
    queryPolicyRows: () => Promise.resolve(input.policyRows ?? null),
  };
}

describe("checkTenantStoreReadiness", () => {
  it("passes when runtime role does not bypass RLS and tenant tables are covered", async () => {
    const schemaTables = await loadUserSchemaTables();
    const tableNames = tenantOwnedTableNames(schemaTables);
    const rlsRows = tableNames.map((tableName) => ({
      tableName,
      rowSecurity: true,
      forceRowSecurity: true,
    }));
    const policyRows = tableNames.map((tableName) => ({
      tableName,
      policyName: "tenant_isolation",
    }));

    const report = await checkTenantStoreReadiness({
      schemaTables,
      sql: createSqlStub({
        role: { roleName: "insecur_runtime", bypassesRls: false },
        rlsRows,
        policyRows,
      }),
    });

    expect(report.status).toBe("ready");
    expect(report.issues).toEqual([]);
    expect(report.runtimeRole).toBe("insecur_runtime");
  });

  it("blocks when the runtime role bypasses RLS", async () => {
    const schemaTables = await loadUserSchemaTables();

    const report = await checkTenantStoreReadiness({
      schemaTables,
      sql: createSqlStub({
        role: { roleName: "insecur_migration", bypassesRls: true },
        rlsRows: [],
        policyRows: [],
      }),
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues).toContainEqual({ code: "runtime_role.bypasses_rls" });
  });

  it("returns unknown when live probes are unreachable", async () => {
    const schemaTables = await loadUserSchemaTables();

    const report = await checkTenantStoreReadiness({
      schemaTables,
      sql: createSqlStub({ throwOnRole: true }),
    });

    expect(report.status).toBe("unknown");
    expect(report.issues).toContainEqual({ code: "probe.unreachable" });
  });
});
