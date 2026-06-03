import {
  AUTHORIZATION_SCOPES,
  EnvironmentLifecycleAccessError,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { updateAuthorizedEnvironmentLifecycle } from "../src/environment-lifecycle.js";
import { testDisplayName } from "./test-display-name.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const READ_ONLY_ACTOR = {
  type: "user" as const,
  userId: userId.brand("usr_00000000000000000000000075"),
};

const STAGING_ID = "env_00000000000000000000000076";
const READ_ONLY_MEMBERSHIP_ID = "mem_00000000000000000000000075";

describeIntegration("updateAuthorizedEnvironmentLifecycle", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async (sql) => {
      await sql`DELETE FROM memberships WHERE id = ${READ_ONLY_MEMBERSHIP_ID}`;
      await sql`DELETE FROM environments WHERE id = ${STAGING_ID}`;
      const store = new TenantEnvironmentLifecycleStore(sql);
      await store.create({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(STAGING_ID),
        displayName: testDisplayName("Staging"),
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.staging,
      });
      await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
        VALUES (
          ${READ_ONLY_MEMBERSHIP_ID},
          ${TEST_ORG_A_ID},
          NULL,
          ${READ_ONLY_ACTOR.userId},
          ${"read-only"},
          ${TEST_PROJECT_A_ID}
        )
      `;
    });
  });

  afterAll(async () => {
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async (sql) => {
      await sql`DELETE FROM memberships WHERE id = ${READ_ONLY_MEMBERSHIP_ID}`;
      await sql`DELETE FROM environments WHERE id = ${STAGING_ID}`;
    });
    await closeRuntimeSql();
  });

  it("denies unauthorized lifecycle metadata updates", async () => {
    const readOnlyAccess = await resolveEffectiveAccess(READ_ONLY_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: environmentId.brand(STAGING_ID),
    });
    expect(hasAuthorizationScope(readOnlyAccess, AUTHORIZATION_SCOPES.projectConfigure)).toBe(
      false,
    );

    await expect(
      updateAuthorizedEnvironmentLifecycle({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(STAGING_ID),
        displayName: testDisplayName("Blocked Rename"),
        effectiveAccess: readOnlyAccess,
        accessCoordinate: {
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: environmentId.brand(STAGING_ID),
        },
      }),
    ).rejects.toBeInstanceOf(EnvironmentLifecycleAccessError);
  });

  it("updates display name when project:configure is present", async () => {
    const ownerAccess = await resolveEffectiveAccess(OWNER_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: environmentId.brand(STAGING_ID),
    });

    const updated = await updateAuthorizedEnvironmentLifecycle({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: environmentId.brand(STAGING_ID),
      displayName: testDisplayName("Staging Primary"),
      effectiveAccess: ownerAccess,
      accessCoordinate: {
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(STAGING_ID),
      },
    });

    expect(updated.displayName).toBe("Staging Primary");
    expect(updated.isProtected).toBe(true);
  });
});
