import {
  AUTHORIZATION_SCOPES,
  FIRST_VALUE_OWNER_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  environmentId,
  membershipId,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { TEST_INSTANCE_ID, TEST_ORG_A_ID } from "../../tenant-store/test/rls/test-ids.js";
import { GuidedOrganizationProvisionError, provisionGuidedOrganization } from "../src/index.js";
import { cleanupGuidedOrganizationFixture } from "./cleanup-guided-organization.js";

const PROVISION_USER_ID = "usr_00000000000000000000000088";
const PROVISION_ORG_ID = "org_00000000000000000000000088";
const PROVISION_TEAM_ID = "team_00000000000000000000000088";
const PROVISION_MEM_ID = "mem_00000000000000000000000088";
const PROVISION_PROJECT_ID = "prj_00000000000000000000000088";
const PROVISION_ENV_ID = "env_00000000000000000000000088";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

interface EnvironmentRow {
  is_protected: boolean;
  display_name: string;
}

interface AuditRow {
  event_code: string;
  outcome: string;
  result_code: string;
}

describeIntegration("provisionGuidedOrganization", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupGuidedOrganizationFixture(PROVISION_ORG_ID);
  });

  afterAll(async () => {
    await cleanupGuidedOrganizationFixture(PROVISION_ORG_ID);
    await closeRuntimeSql();
  });

  it("creates the First Value tenant shape for an admitted user without client-minted ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);

    const result = await provisionGuidedOrganization({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
    });

    expect(result.organizationId).toMatch(/^org_/);
    expect(result.defaultTeamId).toMatch(/^team_/);
    expect(result.ownerMembershipId).toMatch(/^mem_/);
    expect(result.projectId).toMatch(/^prj_/);
    expect(result.developmentEnvironmentId).toMatch(/^env_/);

    const environments = await withTenantScope(
      { kind: "organization", organizationId: result.organizationId },
      async (sql) => {
        return await sql<EnvironmentRow[]>`
          SELECT is_protected, display_name
          FROM environments
          WHERE id = ${result.developmentEnvironmentId}
        `;
      },
    );
    expect(environments[0]?.is_protected).toBe(false);
    expect(environments[0]?.display_name).toBe("Development");

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: admittedUser },
      {
        organizationId: result.organizationId,
        projectId: result.projectId,
      },
    );
    for (const scope of FIRST_VALUE_OWNER_SCOPES) {
      expect(hasAuthorizationScope(effectiveAccess, scope)).toBe(true);
    }
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.onboardingGuidedProvision),
    ).toBe(true);

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: result.organizationId },
      async (sql) => {
        return await sql<AuditRow[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(auditRows[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      result_code: "audit.succeeded",
    });

    await cleanupGuidedOrganizationFixture(result.organizationId);
  });

  it("creates two distinct organizations when called twice without client-minted ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);

    const first = await provisionGuidedOrganization({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
    });
    const second = await provisionGuidedOrganization({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
    });

    expect(second.organizationId).not.toBe(first.organizationId);
    expect(second.defaultTeamId).not.toBe(first.defaultTeamId);
    expect(second.ownerMembershipId).not.toBe(first.ownerMembershipId);
    expect(second.projectId).not.toBe(first.projectId);
    expect(second.developmentEnvironmentId).not.toBe(first.developmentEnvironmentId);

    await cleanupGuidedOrganizationFixture(first.organizationId);
    await cleanupGuidedOrganizationFixture(second.organizationId);
  });

  it("creates the First Value tenant shape with client-minted resource ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);
    const resourceIds = {
      organizationId: organizationId.brand(PROVISION_ORG_ID),
      defaultTeamId: teamId.brand(PROVISION_TEAM_ID),
      ownerMembershipId: membershipId.brand(PROVISION_MEM_ID),
      projectId: projectId.brand(PROVISION_PROJECT_ID),
      developmentEnvironmentId: environmentId.brand(PROVISION_ENV_ID),
    };

    const result = await provisionGuidedOrganization({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
      resourceIds,
    });

    expect(result).toEqual(resourceIds);
  });

  it("conflicts when reusing previously-used client-minted resource ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);
    const resourceIds = {
      organizationId: organizationId.brand(PROVISION_ORG_ID),
      defaultTeamId: teamId.brand(PROVISION_TEAM_ID),
      ownerMembershipId: membershipId.brand(PROVISION_MEM_ID),
      projectId: projectId.brand(PROVISION_PROJECT_ID),
      developmentEnvironmentId: environmentId.brand(PROVISION_ENV_ID),
    };

    await expect(
      provisionGuidedOrganization({
        userId: admittedUser,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
        resourceIds,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
      organizationId: PROVISION_ORG_ID,
    } satisfies Partial<GuidedOrganizationProvisionError>);
  });

  it("does not write audit events into another tenant on resource id collision", async () => {
    const outsider = userId.brand("usr_00000000000000000000000097");
    const collidingOrg = organizationId.brand(TEST_ORG_A_ID);

    const auditCountBefore = await withTenantScope(
      { kind: "organization", organizationId: collidingOrg },
      async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM audit_events
        `;
        return Number(rows[0]?.count ?? "0");
      },
    );

    await expect(
      provisionGuidedOrganization({
        userId: outsider,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
        resourceIds: {
          organizationId: collidingOrg,
          defaultTeamId: teamId.brand("team_00000000000000000000000097"),
          ownerMembershipId: membershipId.brand("mem_00000000000000000000000097"),
          projectId: projectId.brand("prj_00000000000000000000000097"),
          developmentEnvironmentId: environmentId.brand("env_00000000000000000000000097"),
        },
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
    } satisfies Partial<GuidedOrganizationProvisionError>);

    const auditCountAfter = await withTenantScope(
      { kind: "organization", organizationId: collidingOrg },
      async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM audit_events
        `;
        return Number(rows[0]?.count ?? "0");
      },
    );

    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it("denies provisioning for a user who is not admitted", async () => {
    const notAdmittedUser = userId.brand("usr_00000000000000000000000099");
    const freshOrgId = organizationId.brand("org_00000000000000000000000099");

    await expect(
      provisionGuidedOrganization({
        userId: notAdmittedUser,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: false,
        resourceIds: {
          organizationId: freshOrgId,
          defaultTeamId: teamId.brand("team_00000000000000000000000099"),
          ownerMembershipId: membershipId.brand("mem_00000000000000000000000099"),
          projectId: projectId.brand("prj_00000000000000000000000099"),
          developmentEnvironmentId: environmentId.brand("env_00000000000000000000000099"),
        },
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<GuidedOrganizationProvisionError>);

    const orgRows = await withTenantScope({ kind: "service" }, async (sql) => {
      return await sql<{ id: string }[]>`
        SELECT id FROM organizations WHERE id = ${freshOrgId}
      `;
    });
    expect(orgRows).toHaveLength(0);
  });
});
