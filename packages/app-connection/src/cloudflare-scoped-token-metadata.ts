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

/** Stable dotted codes for audit detail maps (ADR-0068 value-type guard). */
export const CLOUDFLARE_TOKEN_STATUS_AUDIT_CODES = {
  active: "connection.token_status.active",
  invalid: "connection.token_status.invalid",
} as const satisfies Record<"active" | "invalid", string>;

export function toCloudflareTokenStatusAuditCode(
  tokenStatus: "active" | "invalid",
): (typeof CLOUDFLARE_TOKEN_STATUS_AUDIT_CODES)[keyof typeof CLOUDFLARE_TOKEN_STATUS_AUDIT_CODES] {
  return CLOUDFLARE_TOKEN_STATUS_AUDIT_CODES[tokenStatus];
}

export function cloudflareConnectionRecordResourceId(appConnectionId: string): OpaqueResourceId {
  return appConnectionId as OpaqueResourceId;
}
