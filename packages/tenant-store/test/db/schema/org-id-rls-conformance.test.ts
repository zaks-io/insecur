import { describe, expect, it } from "vitest";

import { formatConformanceReport } from "../../../src/db/schema/conformance-report.js";
import {
  assertOrgIdRlsConformance,
  findOrgIdRlsViolations,
  formatOrgIdRlsConformanceViolations,
  isTenantOwnedTable,
  tenantOwnedTableNames,
  type TablePolicyRow,
  type TableRlsRow,
} from "../../../src/db/schema/org-id-rls-conformance.js";
import { loadUserSchemaTables } from "../../../src/db/schema/schema-tables.js";

const SCHEMA = await loadUserSchemaTables();

describe("tenant-owned table detection", () => {
  it("treats org_id-bearing tables and organizations as tenant-owned", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    expect(names).toContain("secrets");
    expect(names).toContain("organizations");
    expect(names).toContain("injection_grants");
  });

  it("classifies every loaded tenant table consistently with the name list", () => {
    const tenantTables = SCHEMA.filter(isTenantOwnedTable);
    expect(tenantTables.length).toBe(tenantOwnedTableNames(SCHEMA).length);
  });
});

describe("findOrgIdRlsViolations", () => {
  function rlsFor(names: readonly string[]): TableRlsRow[] {
    return names.map((tableName) => ({ tableName, rowSecurity: true, forceRowSecurity: true }));
  }
  function policiesFor(names: readonly string[]): TablePolicyRow[] {
    return names.map((tableName) => ({ tableName, policyName: `${tableName}_tenant_isolation` }));
  }

  it("returns no violations when every tenant table has FORCE RLS and a policy", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    expect(findOrgIdRlsViolations(SCHEMA, rlsFor(names), policiesFor(names))).toEqual([]);
  });

  it("flags force_row_security_disabled when FORCE is off", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    const [target] = names;
    const rls = names.map((tableName) => ({
      tableName,
      rowSecurity: true,
      forceRowSecurity: tableName !== target,
    }));
    const violations = findOrgIdRlsViolations(SCHEMA, rls, policiesFor(names));
    expect(violations).toContainEqual({
      tableName: target,
      reason: "force_row_security_disabled",
    });
  });

  it("flags no_isolation_policy when the table has FORCE RLS but no policy", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    const violations = findOrgIdRlsViolations(SCHEMA, rlsFor(names), []);
    expect(violations.every((v) => v.reason === "no_isolation_policy")).toBe(true);
    expect(violations.length).toBe(names.length);
  });

  it("flags table_absent_from_database when a schema table is missing live RLS state", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    const violations = findOrgIdRlsViolations(SCHEMA, [], policiesFor(names));
    expect(violations.every((v) => v.reason === "table_absent_from_database")).toBe(true);
  });
});

describe("assertOrgIdRlsConformance", () => {
  it("throws a titled list of offending tables when coverage is incomplete", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    const rls = names.map((tableName) => ({
      tableName,
      rowSecurity: true,
      forceRowSecurity: true,
    }));
    const violations = findOrgIdRlsViolations(SCHEMA, rls, []);
    const expectedMessage = formatConformanceReport(
      "tenant-owned tables missing RLS coverage (FORCE ROW LEVEL SECURITY + isolation policy):",
      violations,
      (violation) => `${violation.tableName}: ${violation.reason}`,
    );

    expect(formatOrgIdRlsConformanceViolations(violations)).toBe(expectedMessage);
    expect(() => assertOrgIdRlsConformance(SCHEMA, rls, [])).toThrowError(expectedMessage);
  });

  it("does not throw when coverage is complete", () => {
    const names = tenantOwnedTableNames(SCHEMA);
    const rls = names.map((tableName) => ({
      tableName,
      rowSecurity: true,
      forceRowSecurity: true,
    }));
    const policies = names.map((tableName) => ({
      tableName,
      policyName: `${tableName}_tenant_isolation`,
    }));
    expect(() => assertOrgIdRlsConformance(SCHEMA, rls, policies)).not.toThrow();
  });
});
