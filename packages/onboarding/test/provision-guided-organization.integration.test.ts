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

  it("creates the First Value tenant shape for an admitted user", async () => {
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

    const environments = await withTenantScope(
      { kind: "organization", organizationId: resourceIds.organizationId },
      async (sql) => {
        return await sql<EnvironmentRow[]>`
          SELECT is_protected, display_name
          FROM environments
          WHERE id = ${resourceIds.developmentEnvironmentId}
        `;
      },
    );
    expect(environments[0]?.is_protected).toBe(false);
    expect(environments[0]?.display_name).toBe("Development");

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: admittedUser },
      {
        organizationId: resourceIds.organizationId,
        projectId: resourceIds.projectId,
      },
    );
    for (const scope of FIRST_VALUE_OWNER_SCOPES) {
      expect(hasAuthorizationScope(effectiveAccess, scope)).toBe(true);
    }
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.onboardingGuidedProvision),
    ).toBe(true);

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: resourceIds.organizationId },
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
  });

  it("is idempotent when retried with the same client-minted resource ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);
    const resourceIds = {
      organizationId: organizationId.brand(PROVISION_ORG_ID),
      defaultTeamId: teamId.brand(PROVISION_TEAM_ID),
      ownerMembershipId: membershipId.brand(PROVISION_MEM_ID),
      projectId: projectId.brand(PROVISION_PROJECT_ID),
      developmentEnvironmentId: environmentId.brand(PROVISION_ENV_ID),
    };

    const second = await provisionGuidedOrganization({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
      resourceIds,
    });

    expect(second).toEqual(resourceIds);
  });

  it("conflicts when provisioning again without client-minted ids", async () => {
    const admittedUser = userId.brand(PROVISION_USER_ID);

    await expect(
      provisionGuidedOrganization({
        userId: admittedUser,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.alreadyProvisioned,
      organizationId: PROVISION_ORG_ID,
    } satisfies Partial<GuidedOrganizationProvisionError>);

    const deniedAudit = await withTenantScope(
      { kind: "organization", organizationId: organizationId.brand(PROVISION_ORG_ID) },
      async (sql) => {
        return await sql<AuditRow[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(deniedAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
      outcome: "denied",
      result_code: ONBOARDING_ERROR_CODES.alreadyProvisioned,
    });
  });

  it("does not write denied audit events into another tenant on resource id collision", async () => {
    const outsider = userId.brand("usr_00000000000000000000000097");
    const collidingOrg = organizationId.brand(TEST_ORG_A_ID);

    const deniedCountBefore = await withTenantScope(
      { kind: "organization", organizationId: collidingOrg },
      async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied}
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

    const deniedCountAfter = await withTenantScope(
      { kind: "organization", organizationId: collidingOrg },
      async (sql) => {
        const rows = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied}
        `;
        return Number(rows[0]?.count ?? "0");
      },
    );

    expect(deniedCountAfter).toBe(deniedCountBefore);
  });

  it("denies provisioning for a user who is not admitted", async () => {
    const notAdmittedUser = userId.brand("usr_00000000000000000000000099");

    await expect(
      provisionGuidedOrganization({
        userId: notAdmittedUser,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: false,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<GuidedOrganizationProvisionError>);
  });
});
