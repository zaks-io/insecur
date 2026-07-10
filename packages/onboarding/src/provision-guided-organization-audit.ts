import { FIRST_VALUE_AUDIT_EVENT_CODES, writeAuditEventInTenantScope } from "@insecur/audit";
import { brandOpaqueResourceIdForPrefix } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { GuidedOrganizationResourceIds } from "./guided-organization-store.js";
import type { ProvisionGuidedOrganizationInput } from "./provision-guided-organization-types.js";

/**
 * Records the guided provisioning success audit on the caller's tenant-scoped
 * transaction, so the audit commits atomically with the provisioned resource graph.
 */
export async function recordProvisionSuccessInTenantScope(
  sql: TenantScopedSql,
  input: ProvisionGuidedOrganizationInput,
  ids: GuidedOrganizationResourceIds,
): Promise<void> {
  await writeAuditEventInTenantScope(sql, {
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
    outcome: "success",
    actor: { type: "user", userId: input.userId },
    organizationId: ids.organizationId,
    projectId: ids.projectId,
    environmentId: ids.developmentEnvironmentId,
    resource: {
      type: "organization",
      id: brandOpaqueResourceIdForPrefix("org", ids.organizationId),
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}
