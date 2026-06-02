import type { OrganizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

/** Clears org-scoped invitation acceptance rows so fixed fixture IDs are safe to reuse. */
export async function cleanupInvitationAcceptanceFixture(input: {
  organizationId: OrganizationId;
  inviteeUserId: string;
  membershipId: string;
  invitationIds: readonly string[];
}): Promise<void> {
  const { organizationId, inviteeUserId, membershipId, invitationIds } = input;

  await withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    await sql`DELETE FROM invitations WHERE invitee_user_id = ${inviteeUserId}`;
    await sql`DELETE FROM memberships WHERE id = ${membershipId}`;
    await sql`DELETE FROM memberships WHERE user_id = ${inviteeUserId}`;
    if (invitationIds.length > 0) {
      await sql`
        DELETE FROM audit_events
        WHERE resource_type = ${"invitation"}
          AND resource_id IN ${sql(invitationIds)}
      `;
    }
  });
}

export async function cleanupMembershipFixture(organizationId: string): Promise<void> {
  await withTenantScope({ kind: "service" }, async (sql) => {
    await sql`DELETE FROM invitations WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM audit_events WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM memberships WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM environments WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM secrets WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM secret_versions WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM injection_grants WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM operations WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM project_data_keys WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM organization_data_keys WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM projects WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM teams WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
}

export async function cleanupInstanceOperatorGrant(
  instanceId: string,
  operatorGrantId: string,
): Promise<void> {
  await withTenantScope({ kind: "service" }, async (sql) => {
    await sql`DELETE FROM instance_operators WHERE id = ${operatorGrantId}`;
    await sql`
      DELETE FROM instance_operators
      WHERE instance_id = ${instanceId}
        AND user_id = ${"usr_00000000000000000000000001"}
        AND grant_origin = ${"admin"}
    `;
  });
}
