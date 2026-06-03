import type { TenantScopedSql } from "@insecur/tenant-store";
import type { AuditEventDetails } from "./audit-types.js";

export function auditDetailsToJson(
  details: AuditEventDetails,
): Parameters<TenantScopedSql["json"]>[0] {
  return JSON.parse(JSON.stringify(details)) as Parameters<TenantScopedSql["json"]>[0];
}
