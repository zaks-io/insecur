import {
  AUTHORIZATION_SCOPES,
  BUILT_IN_ROLE_PRESETS,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  invitationId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  acceptInvitation,
  createInvitation,
  createOperatorOrganization,
  isInstanceOperator,
  MembershipManagementError,
} from "../src/index.js";
import {
  cleanupInstanceOperatorGrant,
  cleanupMembershipFixture,
} from "./cleanup-membership-fixture.js";

const OPERATOR_GRANT_ID = "iop_00000000000000000000000099";
const OPERATOR_ORG_ID = "org_00000000000000000000000099";
const OPERATOR_TEAM_ID = "team_00000000000000000000000099";
const INVITEE_USER_ID = "usr_00000000000000000000000077";
const INVITATION_ID = "inv_00000000000000000000000001";
const GRANTED_MEMBERSHIP_ID = "mem_00000000000000000000000077";
const DUPLICATE_INVITEE_USER_ID = "usr_00000000000000000000000066";
const SECOND_INVITATION_ID = "inv_00000000000000000000000002";
const THIRD_INVITATION_ID = "inv_00000000000000000000000003";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

describeIntegration("membership management (PDF-02)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupMembershipFixture(OPERATOR_ORG_ID);
    await cleanupInstanceOperatorGrant(TEST_INSTANCE_ID, OPERATOR_GRANT_ID);

    await withTenantScope({ kind: "service" }, async (sql) => {
      await sql`
        INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
        VALUES (${OPERATOR_GRANT_ID}, ${TEST_INSTANCE_ID}, ${TEST_USER_ID}, ${"admin"})
        ON CONFLICT (id) DO NOTHING
      `;
    });
  });

  afterAll(async () => {
    await withTenantScope(
      { kind: "organization", organizationId: organizationId.brand(TEST_ORG_A_ID) },
      async (sql) => {
        await sql`DELETE FROM invitations WHERE invitee_user_id = ${INVITEE_USER_ID}`;
        await sql`DELETE FROM memberships WHERE id = ${GRANTED_MEMBERSHIP_ID}`;
      },
    );
    await cleanupMembershipFixture(OPERATOR_ORG_ID);
    await cleanupInstanceOperatorGrant(TEST_INSTANCE_ID, OPERATOR_GRANT_ID);
    await closeRuntimeSql();
  });

  it("creates organizations only for instance operators", async () => {
    const operator = userId.brand(TEST_USER_ID);
    expect(await isInstanceOperator(TEST_INSTANCE_ID, operator)).toBe(true);

    await expect(
      createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: userId.brand(INVITEE_USER_ID),
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.notInstanceOperator,
    });

    const created = await createOperatorOrganization({
      instanceId: TEST_INSTANCE_ID,
      operatorUserId: operator,
      resourceIds: {
        organizationId: organizationId.brand(OPERATOR_ORG_ID),
        defaultTeamId: teamId.brand(OPERATOR_TEAM_ID),
      },
    });

    expect(created.organizationId).toBe(OPERATOR_ORG_ID);
    expect(created.defaultTeamId).toBe(OPERATOR_TEAM_ID);
  });

  it("accepts an invitation into exactly one project-scoped membership", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const ownerActor = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
    const invitee = userId.brand(INVITEE_USER_ID);

    const invitation = await createInvitation({
      actor: ownerActor,
      organizationId: org,
      inviteeUserId: invitee,
      rolePreset: BUILT_IN_ROLE_PRESETS.developer,
      projectId: project,
      invitationId: invitationId.brand(INVITATION_ID),
    });

    const accepted = await acceptInvitation({
      invitationId: invitation.invitationId,
      organizationId: org,
      acceptingUserId: invitee,
      membershipId: membershipId.brand(GRANTED_MEMBERSHIP_ID),
    });

    expect(accepted.membershipId).toBe(GRANTED_MEMBERSHIP_ID);

    const membershipRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async (sql) => {
        return await sql<{ id: string; project_id: string | null }[]>`
          SELECT id, project_id
          FROM memberships
          WHERE user_id = ${INVITEE_USER_ID}
          ORDER BY id
        `;
      },
    );
    expect(membershipRows).toEqual([{ id: GRANTED_MEMBERSHIP_ID, project_id: TEST_PROJECT_A_ID }]);

    const effectiveAccess = await resolveEffectiveAccess(
      { type: "user", userId: invitee },
      { organizationId: org, projectId: project },
    );
    expect(
      hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.secretNonProtectedWrite),
    ).toBe(true);
    expect(hasAuthorizationScope(effectiveAccess, AUTHORIZATION_SCOPES.membershipManage)).toBe(
      false,
    );

    await expect(
      acceptInvitation({
        invitationId: invitation.invitationId,
        organizationId: org,
        acceptingUserId: invitee,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationNotPending,
    });
  });

  it("rejects duplicate pending org-scoped invitations for the same invitee", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const ownerActor = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
    const invitee = userId.brand(DUPLICATE_INVITEE_USER_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async (sql) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${DUPLICATE_INVITEE_USER_ID}`;
    });

    await createInvitation({
      actor: ownerActor,
      organizationId: org,
      inviteeUserId: invitee,
      rolePreset: BUILT_IN_ROLE_PRESETS.readOnly,
      invitationId: invitationId.brand(SECOND_INVITATION_ID),
    });

    await expect(
      createInvitation({
        actor: ownerActor,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: BUILT_IN_ROLE_PRESETS.developer,
        invitationId: invitationId.brand(THIRD_INVITATION_ID),
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async (sql) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${DUPLICATE_INVITEE_USER_ID}`;
      await sql`
        DELETE FROM audit_events
        WHERE resource_type = ${"invitation"}
          AND resource_id IN (${SECOND_INVITATION_ID}, ${THIRD_INVITATION_ID})
      `;
    });
  });

  it("denies cross-organization invitation reads under RLS", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const outsiderInvitee = userId.brand(INVITEE_USER_ID);

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async (sql) =>
        await sql<{ id: string }[]>`
          SELECT id FROM invitations WHERE id = ${INVITATION_ID}
        `,
    );
    expect(rows).toEqual([]);

    await expect(
      acceptInvitation({
        invitationId: invitationId.brand(INVITATION_ID),
        organizationId: orgB,
        acceptingUserId: outsiderInvitee,
      }),
    ).rejects.toBeInstanceOf(MembershipManagementError);
  });

  it("records operator organization and invitation audit events", async () => {
    const operatorOrg = organizationId.brand(OPERATOR_ORG_ID);
    const orgA = organizationId.brand(TEST_ORG_A_ID);

    const operatorAudit = await withTenantScope(
      { kind: "organization", organizationId: operatorOrg },
      async (sql) => {
        return await sql<{ event_code: string }[]>`
          SELECT event_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated}
        `;
      },
    );
    expect(operatorAudit.length).toBeGreaterThan(0);

    const invitationAudit = await withTenantScope(
      { kind: "organization", organizationId: orgA },
      async (sql) => {
        return await sql<{ event_code: string }[]>`
          SELECT event_code
          FROM audit_events
          WHERE resource_type = ${"invitation"}
            AND resource_id = ${INVITATION_ID}
            AND event_code IN ${sql([
              FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
              FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
            ])}
          ORDER BY event_code
        `;
      },
    );
    expect(invitationAudit.map((row) => row.event_code)).toEqual([
      FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
      FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
    ]);
  });
});
