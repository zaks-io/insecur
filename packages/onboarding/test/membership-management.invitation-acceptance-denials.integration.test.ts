import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { invitationId, ONBOARDING_ERROR_CODES, projectId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_TEAM_A_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { acceptInvitation, createInvitation } from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  describeMembershipIntegration,
  DUPLICATE_INVITEE_USER_ID,
  EXISTING_PROJECT_MEMBERSHIP_ID,
  INVITATION_ID,
  INVITEE_USER_ID,
  ORG_A,
  OWNER_ACTOR,
  resetInvitationAcceptanceFixture,
  seedMembershipManagementFixture,
} from "./membership-management.integration-fixture.js";

describeMembershipIntegration(
  "membership management invitation acceptance denials (PDF-02)",
  () => {
    beforeAll(seedMembershipManagementFixture);
    beforeEach(resetInvitationAcceptanceFixture);
    afterAll(cleanupMembershipManagementFixture);

    it("records invitation accept denied audit when accepting user is not the invitee", async () => {
      const org = ORG_A;
      const project = projectId.brand(TEST_PROJECT_A_ID);
      const invitee = userId.brand(INVITEE_USER_ID);
      const wrongAcceptor = userId.brand(DUPLICATE_INVITEE_USER_ID);

      const invitation = await createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: BUILT_IN_ROLE_PRESETS.developer,
        projectId: project,
        invitationId: invitationId.brand(INVITATION_ID),
      });

      await expect(
        acceptInvitation({
          invitationId: invitation.invitationId,
          organizationId: org,
          acceptingUserId: wrongAcceptor,
        }),
      ).rejects.toMatchObject({
        code: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
      });

      const inviteeMismatchDeniedAudit = await withTenantScope(
        { kind: "organization", organizationId: org },
        async ({ sql }) => {
          return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.invitationInviteeMismatch}
            AND resource_type = ${"invitation"}
            AND resource_id = ${INVITATION_ID}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        },
      );
      expect(inviteeMismatchDeniedAudit[0]).toMatchObject({
        event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
        outcome: "denied",
        result_code: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
      });

      const membershipRows = await withTenantScope(
        { kind: "organization", organizationId: org },
        async ({ sql }) => {
          return await sql<{ id: string }[]>`
          SELECT id
          FROM memberships
          WHERE user_id IN (${INVITEE_USER_ID}, ${DUPLICATE_INVITEE_USER_ID})
          ORDER BY id
        `;
        },
      );
      expect(membershipRows).toEqual([]);
    });

    it("records invitation accept denied audit when invitee already has membership for invitation scope", async () => {
      const org = ORG_A;
      const project = projectId.brand(TEST_PROJECT_A_ID);
      const invitee = userId.brand(INVITEE_USER_ID);

      await createInvitation({
        actor: OWNER_ACTOR,
        organizationId: org,
        inviteeUserId: invitee,
        rolePreset: BUILT_IN_ROLE_PRESETS.developer,
        projectId: project,
        invitationId: invitationId.brand(INVITATION_ID),
      });

      await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
        await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
        VALUES (
          ${EXISTING_PROJECT_MEMBERSHIP_ID},
          ${TEST_ORG_A_ID},
          ${TEST_TEAM_A_ID},
          ${INVITEE_USER_ID},
          ${BUILT_IN_ROLE_PRESETS.developer},
          ${TEST_PROJECT_A_ID}
        )
      `;
      });

      await expect(
        acceptInvitation({
          invitationId: invitationId.brand(INVITATION_ID),
          organizationId: org,
          acceptingUserId: invitee,
        }),
      ).rejects.toMatchObject({
        code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
      });

      const membershipAlreadyExistsDeniedAudit = await withTenantScope(
        { kind: "organization", organizationId: org },
        async ({ sql }) => {
          return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.membershipAlreadyExists}
            AND resource_type = ${"invitation"}
            AND resource_id = ${INVITATION_ID}
          ORDER BY created_at DESC
          LIMIT 1
        `;
        },
      );
      expect(membershipAlreadyExistsDeniedAudit[0]).toMatchObject({
        event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
        outcome: "denied",
        result_code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
      });

      const membershipRows = await withTenantScope(
        { kind: "organization", organizationId: org },
        async ({ sql }) => {
          return await sql<{ id: string }[]>`
          SELECT id
          FROM memberships
          WHERE user_id = ${INVITEE_USER_ID}
          ORDER BY id
        `;
        },
      );
      expect(membershipRows).toEqual([{ id: EXISTING_PROJECT_MEMBERSHIP_ID }]);
    });
  },
);
