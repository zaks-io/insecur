import { withTenantScope } from "@insecur/tenant-store";

export async function resolveExportInstanceId(configuredInstanceId?: string): Promise<string> {
  const trimmed = configuredInstanceId?.trim();
  if (trimmed) {
    return trimmed;
  }

  return await withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = (await sql`SELECT id FROM instances ORDER BY id ASC LIMIT 1`) as { id: string }[];
    const instance = rows[0];
    if (!instance) {
      throw new Error("backup export requires at least one instance row");
    }
    return instance.id;
  });
}
