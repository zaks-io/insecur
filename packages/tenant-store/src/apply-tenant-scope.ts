import { sql } from "drizzle-orm";

import type { TenantScopedDb } from "./tenant-scoped-db.js";
import type { TenantScope } from "./tenant-scope.js";

export async function applyTenantScope(db: TenantScopedDb, scope: TenantScope): Promise<void> {
  if (scope.kind === "organization") {
    await db.execute(sql`SELECT set_config('app.current_org', ${scope.organizationId}, true)`);
    await db.execute(sql`SELECT set_config('app.service', '', true)`);
    return;
  }
  await db.execute(sql`SELECT set_config('app.service', 'true', true)`);
  await db.execute(sql`SELECT set_config('app.current_org', '', true)`);
}
