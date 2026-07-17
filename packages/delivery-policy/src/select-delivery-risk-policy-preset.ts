import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type ActorRef,
  type AuthorizeScopeDeps,
} from "@insecur/access";
import {
  DEFAULT_DELIVERY_RISK_POLICY_PRESET,
  DELIVERY_POLICY_ERROR_CODES,
  deliveryRiskPolicyId,
  isDeliveryRiskPolicyPreset,
  isRiskBroadeningDeliveryPolicyChange,
  isSupportedDeliveryRiskPolicyPresetVersion,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import { toAuditActor } from "@insecur/protected-change";
import {
  TenantDeliveryPolicyStore,
  withTenantScope,
  type DeliveryRiskPolicyRow,
} from "@insecur/tenant-store";

import { consumeDeliveryPolicyChangeEvidence } from "./consume-delivery-policy-change-evidence.js";
import { DeliveryPolicyError } from "./delivery-policy-error.js";
import {
  highAssuranceRequiredError,
  recordDeniedDeliveryPolicyAudit,
  requireUserActor,
  toOpaqueResourceId,
} from "./delivery-policy-gate-helpers.js";
import { recordDeliveryPolicyAudit } from "./record-delivery-policy-audit.js";

export interface SelectDeliveryRiskPolicyPresetInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  /** Requested preset key; validated against the versioned preset registry. */
  readonly preset: string;
  /** Preset template version the caller reviewed; must be supported by this build. */
  readonly presetVersion: number;
  readonly actor: ActorRef;
  readonly requestId: RequestId;
  /**
   * Operation carrying cleared High-Assurance Challenge evidence with the
   * `delivery_risk_policy_change` risk reason. Required for Risk-Broadening changes (ADR-0043);
   * ignored for risk-tightening or same-level changes.
   */
  readonly highAssuranceOperationId?: OperationId;
  readonly deps?: AuthorizeScopeDeps;
}

function validateRequestedPreset(input: SelectDeliveryRiskPolicyPresetInput) {
  if (!isDeliveryRiskPolicyPreset(input.preset)) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.presetInvalid,
      "requested delivery risk policy preset is not a known preset",
    );
  }
  if (!isSupportedDeliveryRiskPolicyPresetVersion(input.presetVersion)) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.presetVersionUnsupported,
      "requested delivery risk policy preset version is not supported",
    );
  }
  return input.preset;
}

async function runSelectPresetGates(
  input: SelectDeliveryRiskPolicyPresetInput,
): Promise<{ readonly policy: DeliveryRiskPolicyRow; readonly riskBroadening: boolean }> {
  const actor = requireUserActor(input.actor);
  const preset = validateRequestedPreset(input);

  await authorizeScopeOrThrow({
    actor,
    auditActor: toAuditActor(actor),
    coordinate: { organizationId: input.organizationId, projectId: input.projectId },
    requiredScope: AUTHORIZATION_SCOPES.deliveryPolicyManage,
    requestId: input.requestId,
    ...(input.deps === undefined ? {} : { deps: input.deps }),
  });

  const current = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantDeliveryPolicyStore(db).getPolicyByProject(input.organizationId, input.projectId),
  );

  const baselinePreset = current?.presetKey ?? DEFAULT_DELIVERY_RISK_POLICY_PRESET;
  const riskBroadening = isRiskBroadeningDeliveryPolicyChange(baselinePreset, preset);

  if (riskBroadening) {
    if (input.highAssuranceOperationId === undefined) {
      throw highAssuranceRequiredError();
    }
    await consumeDeliveryPolicyChangeEvidence({
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.highAssuranceOperationId,
      actor,
    });
  }

  const policy = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantDeliveryPolicyStore(db).upsertPolicy({
        policyId: current?.id ?? deliveryRiskPolicyId.generate(),
        organizationId: input.organizationId,
        projectId: input.projectId,
        presetKey: preset,
        presetVersion: input.presetVersion,
        selectedByUserId: actor.userId,
      }),
  );

  return { policy, riskBroadening };
}

/**
 * Selects a versioned Delivery Risk Policy Preset for one Project (ADR-0043, INS-88).
 *
 * Fail-closed gates, in order: human actor only (machine actors are denied — no preset change
 * completes through an agent-reachable channel in V1), known preset, supported preset version,
 * `delivery_policy:manage` Effective Access at the exact Project coordinate, and — for a
 * Risk-Broadening Delivery Change (loosening the preset relative to the current record, or to the
 * Balanced default when none exists) — consumed single-use High-Assurance evidence with the
 * `delivery_risk_policy_change` risk reason. Every selection increments the Project's
 * `policyVersion` and records a metadata-only audit event with preset, versions, and actor.
 */
export async function selectDeliveryRiskPolicyPreset(
  input: SelectDeliveryRiskPolicyPresetInput,
): Promise<DeliveryRiskPolicyRow> {
  const auditScope = {
    action: "preset_selection" as const,
    actor: toAuditActor(input.actor),
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  let outcome: { policy: DeliveryRiskPolicyRow; riskBroadening: boolean };
  try {
    outcome = await runSelectPresetGates(input);
  } catch (error) {
    await recordDeniedDeliveryPolicyAudit(auditScope, error);
    throw error;
  }

  await recordDeliveryPolicyAudit({
    ...auditScope,
    outcome: "success",
    resource: { type: "delivery_risk_policy", id: toOpaqueResourceId(outcome.policy.id, "drp") },
    details: {
      preset: `delivery_policy.preset.${outcome.policy.presetKey}`,
      presetVersion: outcome.policy.presetVersion,
      policyVersion: outcome.policy.policyVersion,
      riskBroadening: outcome.riskBroadening,
    },
  });

  return outcome.policy;
}
