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
  projectId,
  userId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { acceptInvitation, createInvitation } from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  describeMembershipIntegration,
  GRANTED_MEMBERSHIP_ID,
  INVITATION_ID,
  INVITEE_USER_ID,
  ORG_A,
  OWNER_ACTOR,
  resetInvitationAcceptanceFixture,
  seedMembershipManagementFixture,
} from "./membership-management.integration-fixture.js";
import { TEST_PROJECT_A_ID } from "../../tenant-store/test/rls/test-ids.js";

describeMembershipIntegration("membership management invitation acceptance (PDF-02)", () => {
  beforeAll(seedMembershipManagementFixture);
  beforeEach(resetInvitationAcceptanceFixture);
  afterAll(cleanupMembershipManagementFixture);

  it("accepts an invitation into exactly one project-scoped membership", async () => {
    const org = ORG_A;
    const project = projectId.brand(TEST_PROJECT_A_ID);
    const invitee = userId.brand(INVITEE_USER_ID);

    const invitation = await createInvitation({
      actor: OWNER_ACTOR,
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
      async ({ sql }) => {
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

    const invitationAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
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

    await expect(
      acceptInvitation({
        invitationId: invitation.invitationId,
        organizationId: org,
        acceptingUserId: invitee,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationNotPending,
    });

    const notPendingDeniedAudit = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ event_code: string; outcome: string; result_code: string }[]>`
          SELECT event_code, outcome, result_code
          FROM audit_events
          WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied}
            AND result_code = ${ONBOARDING_ERROR_CODES.invitationNotPending}
            AND resource_type = ${"invitation"}
            AND resource_id = ${INVITATION_ID}
          ORDER BY created_at DESC
          LIMIT 1
        `;
      },
    );
    expect(notPendingDeniedAudit[0]).toMatchObject({
      event_code: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
      outcome: "denied",
      result_code: ONBOARDING_ERROR_CODES.invitationNotPending,
    });

    const membershipRowsAfterNotPendingRetry = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) => {
        return await sql<{ id: string; project_id: string | null }[]>`
          SELECT id, project_id
          FROM memberships
          WHERE user_id = ${INVITEE_USER_ID}
          ORDER BY id
        `;
      },
    );
    expect(membershipRowsAfterNotPendingRetry).toEqual(membershipRows);
  });
});
