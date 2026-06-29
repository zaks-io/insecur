import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import { organizationId, userId } from "@insecur/domain";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { describe } from "vitest";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  cleanupInstanceOperatorGrant,
  cleanupInvitationAcceptanceFixture,
  cleanupMembershipFixture,
} from "./cleanup-membership-fixture.js";

export const OPERATOR_GRANT_ID = "iop_00000000000000000000000099";
export const OPERATOR_ORG_ID = "org_00000000000000000000000099";
export const OPERATOR_TEAM_ID = "team_00000000000000000000000099";
/** PDF-02 membership-management fixtures (suffix 80 — avoid bootstrap denial-rollback mem_…71). */
export const INVITEE_USER_ID = "usr_00000000000000000000000071";
export const INVITATION_ID = "inv_00000000000000000000000071";
export const GRANTED_MEMBERSHIP_ID = "mem_00000000000000000000000080";
export const DUPLICATE_INVITEE_USER_ID = "usr_00000000000000000000000066";
export const SECOND_INVITATION_ID = "inv_00000000000000000000000072";
export const THIRD_INVITATION_ID = "inv_00000000000000000000000073";
export const FOURTH_INVITATION_ID = "inv_00000000000000000000000074";
export const FIFTH_INVITATION_ID = "inv_00000000000000000000000075";
export const ORG_SCOPED_INVITEE_USER_ID = "usr_00000000000000000000000074";
/** Pre-seeded project membership for accept-path membershipAlreadyExists denial. */
export const EXISTING_PROJECT_MEMBERSHIP_ID = "mem_00000000000000000000000076";

export const ORG_A = organizationId.brand(TEST_ORG_A_ID);
export const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };

export const describeMembershipIntegration = integrationDatabaseReady ? describe : describe.skip;

export async function seedMembershipManagementFixture(): Promise<void> {
  await seedTenantBaseline();
  await cleanupMembershipFixture(OPERATOR_ORG_ID);
  await cleanupInstanceOperatorGrant(TEST_INSTANCE_ID, OPERATOR_GRANT_ID);

  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`
      INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
      VALUES (${OPERATOR_GRANT_ID}, ${TEST_INSTANCE_ID}, ${TEST_USER_ID}, ${"admin"})
      ON CONFLICT (id) DO NOTHING
    `;
  });
}

export async function resetInvitationAcceptanceFixture(): Promise<void> {
  await cleanupInvitationAcceptanceFixture({
    organizationId: ORG_A,
    inviteeUserId: INVITEE_USER_ID,
    membershipId: GRANTED_MEMBERSHIP_ID,
    invitationIds: [INVITATION_ID],
  });
}

export async function cleanupMembershipManagementFixture(): Promise<void> {
  await cleanupInvitationAcceptanceFixture({
    organizationId: ORG_A,
    inviteeUserId: INVITEE_USER_ID,
    membershipId: GRANTED_MEMBERSHIP_ID,
    invitationIds: [
      INVITATION_ID,
      SECOND_INVITATION_ID,
      THIRD_INVITATION_ID,
      FOURTH_INVITATION_ID,
      FIFTH_INVITATION_ID,
    ],
  });
  await cleanupMembershipFixture(OPERATOR_ORG_ID);
  await cleanupInstanceOperatorGrant(TEST_INSTANCE_ID, OPERATOR_GRANT_ID);
  await closeRuntimeSql();
}

export async function deleteInvitationCreateDeniedAudit(resultCode: string): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    await sql`
      DELETE FROM audit_events
      WHERE event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied}
        AND result_code = ${resultCode}
    `;
  });
}
