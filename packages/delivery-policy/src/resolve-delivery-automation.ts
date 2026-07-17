import type { ActorRef } from "@insecur/access";
import {
  DELIVERY_POLICY_ERROR_CODES,
  DELIVERY_RISK_POLICY_PRESET_TEMPLATES,
  isDeliveryRiskPolicyPreset,
  isSupportedDeliveryRiskPolicyPresetVersion,
  PREVIEW_AUTOMATION_BEHAVIORS,
  type DeliveryRiskPolicyPreset,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import { toAuditActor, type ProtectedDeliveryApprovalVerdict } from "@insecur/protected-change";
import {
  isActivePreviewAutomationOptIn,
  TenantDeliveryPolicyStore,
  withTenantScope,
  type DeliveryRiskPolicyRow,
  type EnvironmentLifecycleRow,
} from "@insecur/tenant-store";

import { DeliveryPolicyError } from "./delivery-policy-error.js";
import {
  recordDeniedDeliveryPolicyAudit,
  toOpaqueResourceId,
} from "./delivery-policy-gate-helpers.js";
import { loadScopedEnvironment } from "./enable-preview-automation-opt-in.js";
import { recordDeliveryPolicyAudit } from "./record-delivery-policy-audit.js";

export interface ResolveDeliveryAutomationInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  /** The actor executing the delivery; user and machine actors resolve identically. */
  readonly actor: ActorRef;
  readonly requestId: RequestId;
  /**
   * Verdict returned by `enforceProtectedDeliveryApproval` (INS-87) for THIS execution's exact
   * delivery target. It is the only thing that authorizes automation against a Protected
   * Environment; the enforcement seam has already consumed the single-use evidence, so a verdict
   * cannot be replayed across executions. Callers must pass the verdict obtained in the same
   * request for the same coordinate, never a cached one.
   */
  readonly protectedDeliveryApproval?: ProtectedDeliveryApprovalVerdict;
}

/** Which rule granted automation authority; recorded in the audit event. */
export type DeliveryAutomationAuthority =
  | "protected_approval_evidence"
  | "development_automation"
  | "preview_automation_opt_in"
  | "preset_preview_default";

export interface DeliveryAutomationDecision {
  readonly status: "allowed";
  readonly authority: DeliveryAutomationAuthority;
  readonly preset: DeliveryRiskPolicyPreset;
  readonly presetVersion: number;
  readonly policyVersion: number;
}

function requireActor(actor: ActorRef | undefined): ActorRef {
  if (actor?.type !== "user" && actor?.type !== "machine") {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.actorInvalid,
      "delivery automation resolution requires a user or machine actor",
    );
  }
  return actor;
}

function requireConfiguredPolicy(policy: DeliveryRiskPolicyRow | null): DeliveryRiskPolicyRow {
  if (policy === null) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.notConfigured,
      "no delivery risk policy is configured for the project",
    );
  }
  if (!isDeliveryRiskPolicyPreset(policy.presetKey)) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.presetInvalid,
      "stored delivery risk policy preset is not a known preset",
    );
  }
  if (!isSupportedDeliveryRiskPolicyPresetVersion(policy.presetVersion)) {
    throw new DeliveryPolicyError(
      DELIVERY_POLICY_ERROR_CODES.presetVersionUnsupported,
      "stored delivery risk policy preset version is not supported by this build",
    );
  }
  return policy;
}

function decision(
  policy: DeliveryRiskPolicyRow,
  authority: DeliveryAutomationAuthority,
): DeliveryAutomationDecision {
  return {
    status: "allowed",
    authority,
    preset: policy.presetKey,
    presetVersion: policy.presetVersion,
    policyVersion: policy.policyVersion,
  };
}

function resolveProtectedEnvironment(
  input: ResolveDeliveryAutomationInput,
  policy: DeliveryRiskPolicyRow,
): DeliveryAutomationDecision {
  if (input.protectedDeliveryApproval?.status === "authorized") {
    return decision(policy, "protected_approval_evidence");
  }
  throw new DeliveryPolicyError(
    DELIVERY_POLICY_ERROR_CODES.protectedApprovalRequired,
    "protected environments require protected delivery approval evidence regardless of preset",
  );
}

async function resolveNonProtectedPreview(
  input: ResolveDeliveryAutomationInput,
  policy: DeliveryRiskPolicyRow,
): Promise<DeliveryAutomationDecision> {
  const previewBehavior = DELIVERY_RISK_POLICY_PRESET_TEMPLATES[policy.presetKey].previewAutomation;

  switch (previewBehavior) {
    case PREVIEW_AUTOMATION_BEHAVIORS.humanReviewRequired:
      throw new DeliveryPolicyError(
        DELIVERY_POLICY_ERROR_CODES.previewAutomationNotAllowed,
        "strict preset requires human review for preview delivery",
      );

    case PREVIEW_AUTOMATION_BEHAVIORS.optIn: {
      const optIn = await withTenantScope(
        { kind: "organization", organizationId: input.organizationId },
        ({ db }) =>
          new TenantDeliveryPolicyStore(db).getPreviewOptInByEnvironment(
            input.organizationId,
            input.environmentId,
          ),
      );
      if (!isActivePreviewAutomationOptIn(optIn)) {
        throw new DeliveryPolicyError(
          DELIVERY_POLICY_ERROR_CODES.previewOptInRequired,
          "balanced preset requires an active preview automation opt-in for the environment",
        );
      }
      return decision(policy, "preview_automation_opt_in");
    }

    case PREVIEW_AUTOMATION_BEHAVIORS.defaultOn:
      return decision(policy, "preset_preview_default");
  }
}

async function resolveDecision(
  input: ResolveDeliveryAutomationInput,
  environment: EnvironmentLifecycleRow,
  policy: DeliveryRiskPolicyRow,
): Promise<DeliveryAutomationDecision> {
  if (environment.isProtected) {
    return resolveProtectedEnvironment(input, policy);
  }

  switch (environment.lifecycleStage) {
    case "development":
      return decision(policy, "development_automation");
    case "preview":
      return resolveNonProtectedPreview(input, policy);
    default:
      // Staging/production are always protected (resolveEnvironmentProtection); if that invariant
      // ever breaks, fail closed toward approval evidence rather than granting automation.
      throw new DeliveryPolicyError(
        DELIVERY_POLICY_ERROR_CODES.protectedApprovalRequired,
        "non-development, non-preview environments require protected delivery approval evidence",
      );
  }
}

async function runResolutionGates(
  input: ResolveDeliveryAutomationInput,
): Promise<DeliveryAutomationDecision> {
  const environment = await loadScopedEnvironment(input);

  const policy = requireConfiguredPolicy(
    await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      ({ db }) =>
        new TenantDeliveryPolicyStore(db).getPolicyByProject(input.organizationId, input.projectId),
    ),
  );

  return resolveDecision(input, environment, policy);
}

/**
 * Fail-closed Delivery Risk Policy automation resolution (ADR-0043, INS-88). Callers invoke this
 * immediately before executing an automated (agent- or CI-reachable) delivery action against an
 * Environment. The verdict never carries Sensitive Values.
 *
 * Rules, in order:
 * - Missing actor, unknown Environment, mismatched scope, missing policy record, or an
 *   unsupported preset version denies with a stable code — never an implicit default.
 * - Protected Environments require protected delivery approval evidence (INS-87) regardless of
 *   preset; automation-friendly behavior never applies there.
 * - Non-protected development Environments allow automation under every preset (First Value and
 *   local loops stay open).
 * - Non-protected preview Environments follow the preset template: Strict denies, Balanced
 *   requires the exact Environment's active Preview Automation Opt-In, Automation-Friendly grants
 *   Preview Automation Authority by default.
 *
 * Machine actors (short-lived machine access evidence, INS-60) resolve identically to users; the
 * audit event records the acting identity either way.
 */
export async function resolveDeliveryAutomation(
  input: ResolveDeliveryAutomationInput,
): Promise<DeliveryAutomationDecision> {
  // Without a well-formed actor there is no identity to audit; deny before anything else runs.
  const actor = requireActor(input.actor);

  const auditScope = {
    action: "automation_resolution" as const,
    actor: toAuditActor(actor),
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };

  let verdict: DeliveryAutomationDecision;
  try {
    verdict = await runResolutionGates(input);
  } catch (error) {
    await recordDeniedDeliveryPolicyAudit(auditScope, error);
    throw error;
  }

  await recordDeliveryPolicyAudit({
    ...auditScope,
    outcome: "success",
    resource: { type: "environment", id: toOpaqueResourceId(input.environmentId, "env") },
    details: {
      authority: `delivery_policy.authority.${verdict.authority}`,
      preset: `delivery_policy.preset.${verdict.preset}`,
      presetVersion: verdict.presetVersion,
      policyVersion: verdict.policyVersion,
    },
  });

  return verdict;
}
