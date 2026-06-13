import { describe, expect, it } from "vitest";
import {
  readExpectedMigrationJournalTail,
  readExpectedPoliciesAndRolesSpec,
} from "../scripts/lib/migration-current.mjs";

describe("migration-current", () => {
  it("reads the journal tail hash for the head migration", () => {
    const tail = readExpectedMigrationJournalTail();
    expect(tail.folderMillis).toBeGreaterThan(0);
    expect(tail.hash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("parses every tenant isolation policy from policies-and-roles.sql", () => {
    const spec = readExpectedPoliciesAndRolesSpec();
    expect(spec.policiesSqlHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(spec.policies.length).toBeGreaterThanOrEqual(18);
    expect(spec.tenantTables).toContain("organizations");
    expect(spec.tenantTables).toContain("secrets");
    expect(spec.policies).toEqual(
      expect.arrayContaining([
        { policyname: "organizations_tenant_isolation", tablename: "organizations" },
        { policyname: "secrets_tenant_isolation", tablename: "secrets" },
      ]),
    );
    for (const policy of spec.policies) {
      expect(spec.tenantTables).toContain(policy.tablename);
    }
  });
});
