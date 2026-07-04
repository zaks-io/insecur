import type { OpaqueResourceId } from "@insecur/domain";

/** Org-scoped sensitive metadata type for Cloudflare connection boundaries. */
export const CLOUDFLARE_CONNECTION_BOUNDARY_METADATA_TYPE =
  "app_connection.cloudflare_boundary" as const;

/** Org-scoped sensitive metadata type for verified provider account linkage. */
export const CLOUDFLARE_CONNECTION_LINKAGE_METADATA_TYPE =
  "app_connection.cloudflare_linkage" as const;

export const CLOUDFLARE_BOUNDARY_FIELD_KEYS = {
  allowedAccountId: "allowed_account_id",
  allowedWorkerScript: "allowed_worker_script",
} as const;

export const CLOUDFLARE_LINKAGE_FIELD_KEYS = {
  providerAccountId: "provider_account_id",
} as const;

export interface CloudflareConnectionBoundary {
  readonly allowedAccountId: string;
  readonly allowedWorkerScript: string;
}

export function cloudflareConnectionRecordResourceId(appConnectionId: string): OpaqueResourceId {
  return appConnectionId as OpaqueResourceId;
}
