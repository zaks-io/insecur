import { FIRST_VALUE_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  ONBOARDING_ERROR_CODES,
  type OrganizationId,
} from "@insecur/domain";
import type { GuidedOrganizationResourceIds } from "./guided-organization-store.js";
import type { ProvisionGuidedOrganizationInput } from "./provision-guided-organization-types.js";

export async function recordProvisionDenied(
  input: ProvisionGuidedOrganizationInput,
  organizationId: OrganizationId,
  reasonCode:
    | typeof AUTH_ERROR_CODES.required
    | typeof ONBOARDING_ERROR_CODES.alreadyProvisioned
    | typeof ONBOARDING_ERROR_CODES.resourceConflict,
): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisionDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.userId },
    organizationId,
    denial: { reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordProvisionSuccess(
  input: ProvisionGuidedOrganizationInput,
  ids: GuidedOrganizationResourceIds,
): Promise<void> {
  await writeAuditEvent({
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
