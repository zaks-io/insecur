import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  invitationId,
  ONBOARDING_ERROR_CODES,
  projectId,
  userId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { TEST_PROJECT_B_ID, TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";
import { createInvitation } from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  deleteInvitationCreateDeniedAudit,
  describeMembershipIntegration,
  DUPLICATE_INVITEE_USER_ID,
  FIFTH_INVITATION_ID,
  FOURTH_INVITATION_ID,
  INVITEE_USER_ID,
  ORG_A,
  ORG_SCOPED_INVITEE_USER_ID,
  OWNER_ACTOR,
  resetInvitationAcceptanceFixture,
  SECOND_INVITATION_ID,
  seedMembershipManagementFixture,
  THIRD_INVITATION_ID,
} from "./membership-management.integration-fixture.js";

describeMembershipIntegration("membership management invitation creation denials (PDF-02)", () => {
  beforeAll(seedMembershipManagementFixture);
  beforeEach(resetInvitationAcceptanceFixture);
  afterAll(cleanupMembershipManagementFixture);

  it("rejects invalid role presets before persistence", async () => {
    const org = ORG_A;
    const invitee = userId.brand(INVITEE_USER_ID);

    await expect(
      createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: "not-a-built-in-role",
        invitationId: invitationId.brand(FOURTH_INVITATION_ID),
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationInvalid,
    });

    const invalidPresetAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.invitationInvalid}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(invalidPresetAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
      outcome: "denied",
      result_code: ONBOARDING_ERROR_CODES.invitationInvalid,
    });

    const invitationRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        await sql<{ id: string }[]>`
          SELECT id FROM invitations WHERE id = ${FOURTH_INVITATION_ID}
        `,
    );
    expect(invitationRows).toEqual([]);

    await deleteInvitationCreateDeniedAudit(ONBOARDING_ERROR_CODES.invitationInvalid);
  });

  it("rejects cross-organization project coordinates with a stable auth denial", async () => {
    const org = ORG_A;
    const invitee = userId.brand(ORG_SCOPED_INVITEE_USER_ID);
    const foreignProject = projectId.brand(TEST_PROJECT_B_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${ORG_SCOPED_INVITEE_USER_ID}`;
    });

    await expect(
      createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: BUILT_IN_ROLE_PRESETS.developer,
        projectId: foreignProject,
        invitationId: invitationId.brand(FIFTH_INVITATION_ID),
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    const crossOrgDeniedAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied}
            AND result_code = ${AUTH_ERROR_CODES.insufficientScope}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(crossOrgDeniedAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
      outcome: "denied",
      result_code: AUTH_ERROR_CODES.insufficientScope,
    });

    const invitationRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        await sql<{ id: string }[]>`
          SELECT id FROM invitations WHERE id = ${FIFTH_INVITATION_ID}
        `,
    );
    expect(invitationRows).toEqual([]);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${ORG_SCOPED_INVITEE_USER_ID}`;
    });
    await deleteInvitationCreateDeniedAudit(AUTH_ERROR_CODES.insufficientScope);
  });

  it("rejects duplicate pending org-scoped invitations for the same invitee", async () => {
    const org = ORG_A;
    const invitee = userId.brand(DUPLICATE_INVITEE_USER_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${DUPLICATE_INVITEE_USER_ID}`;
    });

    await createInvitation({
      actor: OWNER_ACTOR,
      organizationId: org,
      inviteeUserId: invitee,
      rolePreset: BUILT_IN_ROLE_PRESETS.readOnly,
      invitationId: invitationId.brand(SECOND_INVITATION_ID),
    });

    await expect(
      createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: BUILT_IN_ROLE_PRESETS.developer,
        invitationId: invitationId.brand(THIRD_INVITATION_ID),
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
    });

    const duplicateDeniedAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.resourceConflict}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(duplicateDeniedAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
      outcome: "denied",
      result_code: ONBOARDING_ERROR_CODES.resourceConflict,
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${DUPLICATE_INVITEE_USER_ID}`;
      await sql`
        DELETE FROM audit_events
        WHERE resource_type = ${"invitation"}
          AND resource_id IN (${SECOND_INVITATION_ID}, ${THIRD_INVITATION_ID})
      `;
    });
    await deleteInvitationCreateDeniedAudit(ONBOARDING_ERROR_CODES.resourceConflict);
  });

  it("records invitation create denied audit when invitee already has membership", async () => {
    const org = ORG_A;
    const existingMember = userId.brand(TEST_USER_ID);

    await expect(
      createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: existingMember,
        rolePreset: BUILT_IN_ROLE_PRESETS.readOnly,
        invitationId: invitationId.brand(THIRD_INVITATION_ID),
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
    });

    const membershipDeniedAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.membershipAlreadyExists}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(membershipDeniedAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
      outcome: "denied",
      result_code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
    });

    await deleteInvitationCreateDeniedAudit(ONBOARDING_ERROR_CODES.membershipAlreadyExists);
  });
});
