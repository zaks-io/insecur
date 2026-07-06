import { withTenantScope } from "@insecur/tenant-store";

export async function cleanupBootstrapFixture(instanceId: string): Promise<void> {
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`
      DELETE FROM audit_events
      WHERE org_id IN (SELECT id FROM organizations WHERE instance_id = ${instanceId})
    `;
    await sql`
      DELETE FROM memberships
      WHERE org_id IN (SELECT id FROM organizations WHERE instance_id = ${instanceId})
    `;
    await sql`
      DELETE FROM teams
      WHERE org_id IN (SELECT id FROM organizations WHERE instance_id = ${instanceId})
    `;
    await sql`DELETE FROM user_admissions WHERE instance_id = ${instanceId}`;
    await sql`DELETE FROM instance_operators WHERE instance_id = ${instanceId}`;
    await sql`DELETE FROM bootstrap_operator_claims WHERE instance_id = ${instanceId}`;
    await sql`DELETE FROM bootstrap_secret_verifiers WHERE instance_id = ${instanceId}`;
    await sql`
      DELETE FROM organizations WHERE instance_id = ${instanceId}
    `;
    await sql`DELETE FROM instance_identity_configurations WHERE instance_id = ${instanceId}`;
    await sql`DELETE FROM instance_configurations WHERE instance_id = ${instanceId}`;
    await sql`DELETE FROM instances WHERE id = ${instanceId}`;
  });
}
