import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import { invitationId, organizationId, projectId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { TEST_ORG_B_ID, TEST_PROJECT_A_ID } from "../../tenant-store/test/rls/test-ids.js";
import { acceptInvitation, createInvitation, MembershipManagementError } from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  describeMembershipIntegration,
  INVITATION_ID,
  INVITEE_USER_ID,
  ORG_A,
  OWNER_ACTOR,
  resetInvitationAcceptanceFixture,
  seedMembershipManagementFixture,
} from "./membership-management.integration-fixture.js";

describeMembershipIntegration("membership management RLS read denial (PDF-02)", () => {
  beforeAll(seedMembershipManagementFixture);
  beforeEach(resetInvitationAcceptanceFixture);
  afterAll(cleanupMembershipManagementFixture);

  it("denies cross-organization invitation reads under RLS", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const outsiderInvitee = userId.brand(INVITEE_USER_ID);
    const org = ORG_A;
    const project = projectId.brand(TEST_PROJECT_A_ID);

    await createInvitation({
      actor: OWNER_ACTOR,
      organizationId: org,
      inviteeUserId: outsiderInvitee,
      rolePreset: BUILT_IN_ROLE_PRESETS.developer,
      projectId: project,
      invitationId: invitationId.brand(INVITATION_ID),
    });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ sql }) =>
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
});
