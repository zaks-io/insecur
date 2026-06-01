import type { TenantScope } from "./tenant-scope.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

export async function applyTenantScope(sql: TenantScopedSql, scope: TenantScope): Promise<void> {
  if (scope.kind === "organization") {
    await sql`SELECT set_config('app.current_org', ${scope.organizationId}, true)`;
    await sql`SELECT set_config('app.service', '', true)`;
    return;
  }
  await sql`SELECT set_config('app.service', 'true', true)`;
  await sql`SELECT set_config('app.current_org', '', true)`;
}
