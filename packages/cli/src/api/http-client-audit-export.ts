import { authorizedJsonRequest } from "./http-client-metadata.js";
import type { ApiClient, ExportTenantAuditData } from "./types.js";

export async function exportTenantAudit(
  base: string,
  input: Parameters<ApiClient["exportTenantAudit"]>[0],
) {
  const params = new URLSearchParams({
    from: input.from,
    to: input.to,
  });
  const path = `/v1/orgs/${input.organizationId}/audit-export?${params.toString()}`;
  return authorizedJsonRequest<ExportTenantAuditData>(base, path, input.bearerCredential, {
    method: "GET",
  });
}
