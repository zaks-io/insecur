import type { AuditEventDetails } from "./audit-types.js";

export function auditDetailsToJson(details: AuditEventDetails): AuditEventDetails {
  return JSON.parse(JSON.stringify(details)) as AuditEventDetails;
}
