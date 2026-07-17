import { DELIVERY_POLICY_ERROR_CODES } from "@insecur/domain";
import { toAuditActor } from "@insecur/protected-change";
import {
  TenantDeliveryPolicyStore,
  withTenantScope,
  type PreviewAutomationOptInRow,
} from "@insecur/tenant-store";

import { DeliveryPolicyError } from "./delivery-policy-error.js";
import {
  authorizeDeliveryPolicyManageAtEnvironment,
  recordDeniedDeliveryPolicyAudit,
  requireUserActor,
  toOpaqueResourceId,
} from "./delivery-policy-gate-helpers.js";
import {
  loadScopedEnvironment,
  type PreviewAutomationOptInScope,
} from "./enable-preview-automation-opt-in.js";
import { recordDeliveryPolicyAudit } from "./record-delivery-policy-audit.js";

async function runRevokeOptInGates(
  input: PreviewAutomationOptInScope,
): Promise<PreviewAutomationOptInRow> {
  const actor = requireUserActor(input.actor);
  await authorizeDeliveryPolicyManageAtEnvironment(input, actor);
  await loadScopedEnvironment(input);

  const revoked = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantDeliveryPolicyStore(db).revokePreviewOptIn({
        organizationId: input.organizationId,
        environmentId: input.environmentId,
        revokedByUserId: actor.userId,
      }),
  );

  if (revoked === null) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.optInNotFound,
      "no active preview automation opt-in exists for the environment",
    );
  }
  return revoked;
}

/**
 * Revokes the per-Environment Preview Automation Opt-In (ADR-0043, INS-88). A Risk-Tightening
 * Delivery Change: no High-Assurance Challenge required, but still human-only, scope-gated at the
 * exact Environment coordinate, and audited with who revoked it and when. Fails closed with
 * `delivery_policy.opt_in_not_found` when no active opt-in exists.
 */
export async function revokePreviewAutomationOptIn(
  input: PreviewAutomationOptInScope,
): Promise<PreviewAutomationOptInRow> {
  const auditScope = {
    action: "preview_opt_in_revoke" as const,
    actor: toAuditActor(input.actor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  let optIn: PreviewAutomationOptInRow;
  try {
    optIn = await runRevokeOptInGates(input);
  } catch (error) {
    await recordDeniedDeliveryPolicyAudit(auditScope, error);
    throw error;
  }

  await recordDeliveryPolicyAudit({
    ...auditScope,
    outcome: "success",
    resource: { type: "environment", id: toOpaqueResourceId(optIn.environmentId, "env") },
    details: { optInActive: false },
  });

  return optIn;
}
