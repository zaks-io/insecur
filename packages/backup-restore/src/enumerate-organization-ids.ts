import { withTenantScope } from "@insecur/tenant-store";

export async function enumerateOrganizationIds(): Promise<string[]> {
  return await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = (await sql`SELECT id FROM organizations ORDER BY id ASC`) as { id: string }[];
    return rows.map((row) => row.id);
  });
}
