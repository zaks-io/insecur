import { ENVIRONMENT_ERROR_CODES, type EnvironmentId, type OrganizationId } from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";

export async function assertProtectedEnvironment(
  organizationId: OrganizationId,
  environmentId: EnvironmentId,
): Promise<void> {
  const environment = await withTenantScope({ kind: "organization", organizationId }, ({ db }) =>
    new TenantEnvironmentLifecycleStore(db).getById(organizationId, environmentId),
  );
  if (!environment) {
    throw Object.assign(new Error("Environment not found."), {
      code: ENVIRONMENT_ERROR_CODES.notFound,
    });
  }
  if (!environment.isProtected) {
    throw Object.assign(new Error("Protected mutation requires a protected environment."), {
      code: ENVIRONMENT_ERROR_CODES.nonProtectedEnvironment,
    });
  }
}
