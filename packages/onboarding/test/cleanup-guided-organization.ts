import { withTenantScope } from "@insecur/tenant-store";

/** Removes a guided-organization fixture from the shared local Postgres test database. */
export async function cleanupGuidedOrganizationFixture(organizationId: string): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`DELETE FROM audit_events WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM secret_versions WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM secrets WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM memberships WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM environments WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM projects WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM teams WHERE org_id = ${organizationId}`;
    await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
  });
}
