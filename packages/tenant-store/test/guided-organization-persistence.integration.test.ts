import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  membershipId,
  organizationId,
  parseDisplayName,
  projectId,
  teamId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  closeRuntimeSql,
  persistGuidedOrganizationInTenantScope,
  withTenantScope,
  type PersistGuidedOrganizationInput,
} from "../src/index.js";
import { integrationDatabaseReady } from "./rls/integration-database-ready.js";
import { seedTenantBaseline } from "./rls/seed.js";
import { TEST_ENV_A_ID, TEST_INSTANCE_ID } from "./rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const SUCCESS_ORG_ID = "org_00000000000000000000000288";
const SUCCESS_PROJECT_ID = "prj_00000000000000000000000288";
const SUCCESS_TEAM_ID = "team_00000000000000000000000288";
const SUCCESS_MEMBERSHIP_ID = "mem_00000000000000000000000288";
const SUCCESS_ENVIRONMENT_ID = "env_00000000000000000000000288";

const ROLLBACK_ORG_ID = "org_00000000000000000000000289";
const ROLLBACK_PROJECT_ID = "prj_00000000000000000000000289";
const ROLLBACK_TEAM_ID = "team_00000000000000000000000289";
const ROLLBACK_MEMBERSHIP_ID = "mem_00000000000000000000000289";

const PROVISION_USER_ID = userId.brand("usr_00000000000000000000000288");

interface GuidedOrganizationGraphRow {
  org_display_name: string;
  project_display_name: string;
  team_display_name: string;
  team_is_default: boolean;
  membership_team_id: string;
  membership_user_id: string;
  membership_role_preset: string;
  environment_display_name: string;
  environment_lifecycle_stage: string;
  environment_is_protected: boolean;
  preview_non_production_confirmed_at: Date | null;
  preview_non_production_confirmed_by_user_id: string | null;
}

interface ResourceGraphCountsRow {
  organization_count: string;
  project_count: string;
  team_count: string;
  membership_count: string;
}

async function persistGuidedOrganizationForTest(
  input: PersistGuidedOrganizationInput,
): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (handles) => {
      await persistGuidedOrganizationInTenantScope(handles, input);
    },
  );
}

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function cleanupGuidedOrganizationFixture(orgId: string): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`DELETE FROM memberships WHERE org_id = ${orgId}`;
    await sql`DELETE FROM environments WHERE org_id = ${orgId}`;
    await sql`DELETE FROM projects WHERE org_id = ${orgId}`;
    await sql`DELETE FROM teams WHERE org_id = ${orgId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  });
}

describeIntegration("persistGuidedOrganizationInTenantScope", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupGuidedOrganizationFixture(SUCCESS_ORG_ID);
    await cleanupGuidedOrganizationFixture(ROLLBACK_ORG_ID);
  });

  afterAll(async () => {
    await cleanupGuidedOrganizationFixture(SUCCESS_ORG_ID);
    await cleanupGuidedOrganizationFixture(ROLLBACK_ORG_ID);
    await closeRuntimeSql();
  });

  it("creates the guided organization resource graph in one tenant-scoped operation", async () => {
    const organizationDisplayName = testDisplayName("Tenant Store Guided Org");
    const projectDisplayName = testDisplayName("Tenant Store Project");
    const teamDisplayName = testDisplayName("Tenant Store Default Team");
    const environmentDisplayName = testDisplayName("Tenant Store Development");

    await persistGuidedOrganizationForTest({
      organizationId: organizationId.brand(SUCCESS_ORG_ID),
      projectId: projectId.brand(SUCCESS_PROJECT_ID),
      defaultTeamId: teamId.brand(SUCCESS_TEAM_ID),
      ownerMembershipId: membershipId.brand(SUCCESS_MEMBERSHIP_ID),
      developmentEnvironmentId: environmentId.brand(SUCCESS_ENVIRONMENT_ID),
      instanceId: TEST_INSTANCE_ID,
      userId: PROVISION_USER_ID,
      organizationDisplayName,
      projectDisplayName,
      teamDisplayName,
      environmentDisplayName,
    });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: organizationId.brand(SUCCESS_ORG_ID) },
      async ({ sql }) => {
        return await sql<GuidedOrganizationGraphRow[]>`
          SELECT
            o.display_name AS org_display_name,
            p.display_name AS project_display_name,
            t.display_name AS team_display_name,
            t.is_default AS team_is_default,
            m.team_id AS membership_team_id,
            m.user_id AS membership_user_id,
            m.role_preset AS membership_role_preset,
            e.display_name AS environment_display_name,
            e.lifecycle_stage AS environment_lifecycle_stage,
            e.is_protected AS environment_is_protected,
            e.preview_non_production_confirmed_at,
            e.preview_non_production_confirmed_by_user_id
          FROM organizations o
          JOIN projects p ON p.org_id = o.id AND p.id = ${SUCCESS_PROJECT_ID}
          JOIN teams t ON t.org_id = o.id AND t.id = ${SUCCESS_TEAM_ID}
          JOIN memberships m ON m.org_id = o.id AND m.id = ${SUCCESS_MEMBERSHIP_ID}
          JOIN environments e ON e.org_id = o.id AND e.id = ${SUCCESS_ENVIRONMENT_ID}
          WHERE o.id = ${SUCCESS_ORG_ID}
        `;
      },
    );

    expect(rows).toEqual([
      {
        org_display_name: organizationDisplayName,
        project_display_name: projectDisplayName,
        team_display_name: teamDisplayName,
        team_is_default: true,
        membership_team_id: SUCCESS_TEAM_ID,
        membership_user_id: PROVISION_USER_ID,
        membership_role_preset: "owner",
        environment_display_name: environmentDisplayName,
        environment_lifecycle_stage: ENVIRONMENT_LIFECYCLE_STAGES.development,
        environment_is_protected: false,
        preview_non_production_confirmed_at: null,
        preview_non_production_confirmed_by_user_id: null,
      },
    ]);
  });

  it("rolls back earlier resource inserts when environment creation fails", async () => {
    await expect(
      persistGuidedOrganizationForTest({
        organizationId: organizationId.brand(ROLLBACK_ORG_ID),
        projectId: projectId.brand(ROLLBACK_PROJECT_ID),
        defaultTeamId: teamId.brand(ROLLBACK_TEAM_ID),
        ownerMembershipId: membershipId.brand(ROLLBACK_MEMBERSHIP_ID),
        developmentEnvironmentId: environmentId.brand(TEST_ENV_A_ID),
        instanceId: TEST_INSTANCE_ID,
        userId: PROVISION_USER_ID,
        organizationDisplayName: testDisplayName("Rollback Guided Org"),
        projectDisplayName: testDisplayName("Rollback Project"),
        teamDisplayName: testDisplayName("Rollback Default Team"),
        environmentDisplayName: testDisplayName("Rollback Development"),
      }),
    ).rejects.toBeTruthy();

    const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
      return await sql<ResourceGraphCountsRow[]>`
        SELECT
          (SELECT COUNT(*)::text FROM organizations WHERE id = ${ROLLBACK_ORG_ID}) AS organization_count,
          (SELECT COUNT(*)::text FROM projects WHERE id = ${ROLLBACK_PROJECT_ID}) AS project_count,
          (SELECT COUNT(*)::text FROM teams WHERE id = ${ROLLBACK_TEAM_ID}) AS team_count,
          (SELECT COUNT(*)::text FROM memberships WHERE id = ${ROLLBACK_MEMBERSHIP_ID}) AS membership_count
      `;
    });

    expect(rows[0]).toEqual({
      organization_count: "0",
      project_count: "0",
      team_count: "0",
      membership_count: "0",
    });
  });
});
