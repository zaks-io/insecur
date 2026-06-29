import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import { invitationId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { TEST_ORG_A_ID } from "../../tenant-store/test/rls/test-ids.js";
import { createInvitation } from "../src/index.js";
import {
  cleanupMembershipManagementFixture,
  describeMembershipIntegration,
  FOURTH_INVITATION_ID,
  ORG_A,
  ORG_SCOPED_INVITEE_USER_ID,
  OWNER_ACTOR,
  resetInvitationAcceptanceFixture,
  seedMembershipManagementFixture,
} from "./membership-management.integration-fixture.js";

describeMembershipIntegration("membership management invitation creation (PDF-02)", () => {
  beforeAll(seedMembershipManagementFixture);
  beforeEach(resetInvitationAcceptanceFixture);
  afterAll(cleanupMembershipManagementFixture);

  it("creates a valid organization-scoped invitation", async () => {
    const org = ORG_A;
    const invitee = userId.brand(ORG_SCOPED_INVITEE_USER_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE invitee_user_id = ${ORG_SCOPED_INVITEE_USER_ID}`;
    });

    const created = await createInvitation({
      actor: OWNER_ACTOR,
      organizationId: org,
      inviteeUserId: invitee,
      rolePreset: BUILT_IN_ROLE_PRESETS.readOnly,
      invitationId: invitationId.brand(FOURTH_INVITATION_ID),
    });

    expect(created).toMatchObject({
      invitationId: FOURTH_INVITATION_ID,
      organizationId: TEST_ORG_A_ID,
      inviteeUserId: ORG_SCOPED_INVITEE_USER_ID,
      rolePreset: BUILT_IN_ROLE_PRESETS.readOnly,
      projectId: null,
    });

    const invitationRows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        await sql<{ role_preset: string; project_id: string | null; status: string }[]>`
          SELECT role_preset, project_id, status
          FROM invitations
          WHERE id = ${FOURTH_INVITATION_ID}
        `,
    );
    expect(invitationRows[0]).toMatchObject({
      role_preset: BUILT_IN_ROLE_PRESETS.readOnly,
      project_id: null,
      status: "pending",
    });

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`DELETE FROM invitations WHERE id = ${FOURTH_INVITATION_ID}`;
      await sql`
        DELETE FROM audit_events
        WHERE resource_type = ${"invitation"}
          AND resource_id = ${FOURTH_INVITATION_ID}
      `;
    });
  });
});
