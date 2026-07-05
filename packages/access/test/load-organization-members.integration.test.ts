import { organizationId } from "@insecur/domain";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadOrganizationMembers } from "../src/load-organization-members.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_MEM_A_ID,
  TEST_MEM_B_ID,
  TEST_ORG_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);

describeIntegration("loadOrganizationMembers", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("returns the org's membership rows joined with admission display names", async () => {
    const members = await loadOrganizationMembers(ORG_A);

    const baseline = members.find((member) => member.membershipId === TEST_MEM_A_ID);
    expect(baseline).toBeDefined();
    expect(baseline?.userId).toBe(TEST_USER_ID);
    expect(baseline?.displayName).toBe("Synthetic baseline user");
    expect(baseline?.rolePreset).toBe("owner");
    expect(baseline?.projectId).toBeNull();
    expect(baseline?.createdAt).toBeInstanceOf(Date);
  });

  it("keeps the read tenant-bound under forced RLS: org A never returns org B rows", async () => {
    const members = await loadOrganizationMembers(ORG_A);

    expect(members.length).toBeGreaterThan(0);
    expect(members.every((member) => member.organizationId === TEST_ORG_A_ID)).toBe(true);
    expect(members.map((member) => member.membershipId)).not.toContain(TEST_MEM_B_ID);
  });

  it("reads a nonexistent organization as empty, indistinguishable from having no members", async () => {
    const members = await loadOrganizationMembers(
      organizationId.brand("org_00000000000000000000000373"),
    );

    expect(members).toEqual([]);
  });
});
