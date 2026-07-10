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

import type { TenantScopedDb } from "./tenant-scoped-db.js";
import type { TenantScopedSql } from "./tenant-scoped-sql.js";

/** Handles for the active tenant-scoped Drizzle transaction (ADR-0037). */
export interface TenantScopedHandles {
  /** Drizzle query builder bound to the scoped transaction. */
  db: TenantScopedDb;
  /** postgres.js tagged SQL on the same transaction (raw statements). */
  sql: TenantScopedSql;
  /** Present when the transaction explicitly captured its database snapshot instant. */
  snapshotAt?: string;
}

export type TenantScopedCallback<TResult> = (handles: TenantScopedHandles) => Promise<TResult>;

export interface TenantScopeTransactionOptions {
  readonly isolationLevel?: "repeatable read";
  readonly readOnly?: true;
  readonly captureSnapshotAt?: true;
}
