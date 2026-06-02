import { withTenantScope } from "@insecur/tenant-store";

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
