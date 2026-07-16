import type { UserActorRef } from "@insecur/access";
import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RequestId,
  SecretSyncId,
} from "@insecur/domain";
import { resolveSecretSyncRunAccess } from "./assert-secret-sync-access.js";
import type { SecretSyncProviderLookupPorts } from "./provider-lookup-port.js";
import { toSecretSyncAuditReasonCode } from "./record-secret-sync-audit.js";
import {
  recordSecretSyncPlanCompleted,
  recordSecretSyncPlanDenied,
  toPlanBindingAuditDetails,
} from "./record-secret-sync-plan-audit.js";
import { buildSecretSyncCommandAuditScope } from "./secret-sync-command-shared.js";
import { computeSecretSyncPlanInTenantScope, type SecretSyncPlan } from "./secret-sync-plan.js";

export interface PlanSecretSyncCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly lookupPorts: SecretSyncProviderLookupPorts;
  readonly requestId: RequestId;
}

export interface PlanSecretSyncCommandResult {
  readonly plan: SecretSyncPlan;
  readonly auditEventId: string;
}

/**
 * Plans a Secret Sync with metadata-only Explicit Provider Lookup for each
 * exact configured binding destination. Plan output carries target existence,
 * permission status, overwrite warnings, and connection status; it never
 * reads or displays provider secret values.
 */
export async function planSecretSyncCommand(
  input: PlanSecretSyncCommandInput,
): Promise<PlanSecretSyncCommandResult> {
  const auditScope = buildSecretSyncCommandAuditScope({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requestId: input.requestId,
  });

  try {
    await resolveSecretSyncRunAccess(input.actor, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
    });

    const plan = await computeSecretSyncPlanInTenantScope({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretSyncId: input.secretSyncId,
      lookupPorts: input.lookupPorts,
    });

    const audit = await recordSecretSyncPlanCompleted({
      ...auditScope,
      secretSyncId: plan.secretSyncId,
      details: toPlanBindingAuditDetails(plan),
    });
    return { plan, auditEventId: audit.auditEventId };
  } catch (error) {
    await recordSecretSyncPlanDenied({
      ...auditScope,
      secretSyncId: input.secretSyncId,
      reasonCode: toSecretSyncAuditReasonCode(error),
    });
    throw error;
  }
}
