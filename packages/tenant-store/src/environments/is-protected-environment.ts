import type { EnvironmentId, OrganizationId } from "@insecur/domain";

import { TenantEnvironmentLifecycleStore } from "./tenant-environment-lifecycle-store.js";
import { withTenantScope } from "../with-tenant-scope.js";

export async function isProtectedEnvironment(
  organizationId: OrganizationId,
  environmentId: EnvironmentId,
): Promise<boolean> {
  return await withTenantScope({ kind: "organization", organizationId }, async ({ db }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const environment = await store.getById(organizationId, environmentId);
    return environment?.isProtected === true;
  });
}
