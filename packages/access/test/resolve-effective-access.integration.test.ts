import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
} from "../src/index.js";
import { organizationId, projectId, userId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const TEST_MEM_PROJECT_DEV_ID = "mem_00000000000000000000000003";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ACTOR = {
  type: "user" as const,
  userId: userId.brand(TEST_USER_ID),
};

describeIntegration("resolveEffectiveAccess (tenant-scoped store)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("resolves owner First Value scopes for the seeded organization", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const result = await resolveEffectiveAccess(ACTOR, {
      organizationId: org,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
    });

    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.onboardingGuidedProvision)).toBe(
      true,
    );
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.secretNonProtectedWrite)).toBe(true);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(true);
  });

  it("unions project-tier memberships loaded in one tenant-scoped batch read", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
        VALUES (
          ${TEST_MEM_PROJECT_DEV_ID},
          ${TEST_ORG_A_ID},
          NULL,
          ${TEST_USER_ID},
          ${"developer"},
          ${TEST_PROJECT_A_ID}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    });

    const results = await resolveEffectiveAccessBatch(ACTOR, [
      { organizationId: org, projectId: project },
    ]);
    expect(results).toHaveLength(1);
    const atProject = results[0];
    if (atProject === undefined) {
      throw new Error("expected one effective access result");
    }

    expect(hasAuthorizationScope(atProject, AUTHORIZATION_SCOPES.onboardingGuidedProvision)).toBe(
      true,
    );
    expect(hasAuthorizationScope(atProject, AUTHORIZATION_SCOPES.secretNonProtectedWrite)).toBe(
      true,
    );
  });

  it("returns empty scopes when guessing another organization coordinate", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const outsider = {
      type: "user" as const,
      userId: userId.brand("usr_00000000000000000000000099"),
    };

    const result = await resolveEffectiveAccess(outsider, {
      organizationId: orgB,
      projectId: projectId.brand(TEST_PROJECT_B_ID),
    });

    expect(result.scopes).toEqual([]);
  });
});
