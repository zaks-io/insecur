import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import {
  DELIVERY_POLICY_ERROR_CODES,
  ENVIRONMENT_ERROR_CODES,
  previewAutomationOptInId,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import { toAuditActor } from "@insecur/protected-change";
import {
  EnvironmentLifecycleStoreError,
  TenantDeliveryPolicyStore,
  TenantEnvironmentLifecycleStore,
  withTenantScope,
  type EnvironmentLifecycleRow,
  type PreviewAutomationOptInRow,
} from "@insecur/tenant-store";

import { consumeDeliveryPolicyChangeEvidence } from "./consume-delivery-policy-change-evidence.js";
import { DeliveryPolicyError } from "./delivery-policy-error.js";
import {
  authorizeDeliveryPolicyManageAtEnvironment,
  highAssuranceRequiredError,
  recordDeniedDeliveryPolicyAudit,
  requireUserActor,
  toOpaqueResourceId,
} from "./delivery-policy-gate-helpers.js";
import { recordDeliveryPolicyAudit } from "./record-delivery-policy-audit.js";

export interface PreviewAutomationOptInScope {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actor: ActorRef;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

export interface EnablePreviewAutomationOptInInput extends PreviewAutomationOptInScope {
  /**
   * Operation carrying cleared High-Assurance Challenge evidence with the
   * `delivery_risk_policy_change` risk reason. Enabling a Preview Automation Opt-In is always a
   * Risk-Broadening Delivery Change (ADR-0043), so this is required regardless of preset.
   */
  readonly highAssuranceOperationId?: OperationId;
}

/** Loads the exact Environment, failing closed on absence or a Project coordinate mismatch. */
export async function loadScopedEnvironment(
  scope: Pick<PreviewAutomationOptInScope, "organizationId" | "projectId" | "environmentId">,
): Promise<EnvironmentLifecycleRow> {
  const environment = await withTenantScope(
    { kind: "organization", organizationId: scope.organizationId },
    ({ db }) =>
      new TenantEnvironmentLifecycleStore(db).getById(scope.organizationId, scope.environmentId),
  );

  if (environment === null) {
    throw new EnvironmentLifecycleStoreError(
      ENVIRONMENT_ERROR_CODES.notFound,
      "environment not found",
    );
  }
  if (environment.projectId !== scope.projectId) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.scopeInvalid,
      "environment does not belong to the requested project",
    );
  }
  return environment;
}

/**
 * Loads the exact Environment and fails closed unless it is a non-protected preview Environment
 * inside the requested Project. Protected Environments never accept automation opt-ins; they
 * always require protected delivery approval evidence (INS-87).
 */
export async function loadOptInEligibleEnvironment(
  scope: Pick<PreviewAutomationOptInScope, "organizationId" | "projectId" | "environmentId">,
): Promise<EnvironmentLifecycleRow> {
  const environment = await loadScopedEnvironment(scope);
  if (environment.lifecycleStage !== "preview" || environment.isProtected) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.optInEnvironmentInvalid,
      "preview automation opt-in applies only to non-protected preview environments",
    );
  }
  return environment;
}

async function runEnableOptInGates(
  input: EnablePreviewAutomationOptInInput,
): Promise<PreviewAutomationOptInRow> {
  const actor = requireUserActor(input.actor);
  await authorizeDeliveryPolicyManageAtEnvironment(input, actor);
  await loadOptInEligibleEnvironment(input);

  if (input.highAssuranceOperationId === undefined) {
    throw highAssuranceRequiredError();
  }
  await consumeDeliveryPolicyChangeEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    operationId: input.highAssuranceOperationId,
    actor,
  });

  return withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    new TenantDeliveryPolicyStore(db).enablePreviewOptIn({
      optInId: previewAutomationOptInId.generate(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      enabledByUserId: actor.userId,
    }),
  );
}

/**
 * Enables the explicit per-Environment Preview Automation Opt-In (ADR-0043, INS-88), recording
 * who enabled it and when. Fail-closed gates: human actor only, `delivery_policy:manage` scope at
 * the exact Environment coordinate, a non-protected preview Environment in the requested Project,
 * and consumed single-use High-Assurance evidence (enabling an opt-in is always Risk-Broadening).
 * The opt-in grants execution authority only under the Balanced preset's opt-in rule; Strict still
 * denies preview automation and Protected Environments still require approval evidence.
 */
export async function enablePreviewAutomationOptIn(
  input: EnablePreviewAutomationOptInInput,
): Promise<PreviewAutomationOptInRow> {
  const auditScope = {
    action: "preview_opt_in_enable" as const,
    actor: toAuditActor(input.actor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  let optIn: PreviewAutomationOptInRow;
  try {
    optIn = await runEnableOptInGates(input);
  } catch (error) {
    await recordDeniedDeliveryPolicyAudit(auditScope, error);
    throw error;
  }

  await recordDeliveryPolicyAudit({
    ...auditScope,
    outcome: "success",
    resource: { type: "environment", id: toOpaqueResourceId(optIn.environmentId, "env") },
    details: { optInActive: true },
  });

  return optIn;
}
