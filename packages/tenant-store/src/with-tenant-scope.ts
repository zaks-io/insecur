import type { OrganizationId } from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

/** Store scope passed into every tenant-scoped database entry point. */
export interface TenantScope {
  organizationId: OrganizationId;
}

export type TenantScopedCallback<TResult> = () => Promise<TResult>;

/**
 * The only supported database entry point for tenant-owned metadata.
 * @see docs/adr/0037-tenant-scoped-bound-store-over-rls.md
 */
export function withTenantScope<TResult>(
  scope: TenantScope,
  callback: TenantScopedCallback<TResult>,
): Promise<TResult> {
  void scope;
  void callback;
  return Promise.reject(new NotImplementedError("withTenantScope"));
}
