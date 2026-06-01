import type { OrganizationId } from "@insecur/domain";

/** Organization Access: rows for one Organization only. */
export interface OrganizationTenantScope {
  kind: "organization";
  organizationId: OrganizationId;
}

/** Service Access: cross-Organization support gate (ADR-0019). */
export interface ServiceTenantScope {
  kind: "service";
}

export type TenantScope = OrganizationTenantScope | ServiceTenantScope;

import type { TenantScopedSql } from "./tenant-scoped-sql.js";

export type TenantScopedCallback<TResult> = (sql: TenantScopedSql) => Promise<TResult>;
