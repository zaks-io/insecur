import type { UserActorRef } from "@insecur/access";
import {
  OPERATION_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
  type EnvironmentId,
  type KnownErrorCode,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretSyncId,
} from "@insecur/domain";
import { resolveSecretSyncRunAccess } from "./assert-secret-sync-access.js";
import { assertProtectedSecretSyncActionApproved } from "./assert-secret-sync-delivery-approval.js";
import {
  PROVIDER_LOOKUP_STATUSES,
  type ProviderLookupStatus,
  type SecretSyncProviderLookupPorts,
} from "./provider-lookup-port.js";
import { toSecretSyncAuditReasonCode } from "./record-secret-sync-audit.js";
import { recordSecretSyncRevalidationDenied } from "./record-secret-sync-plan-audit.js";
import { SecretSyncError } from "./secret-sync-error.js";
import { computeSecretSyncPlanInTenantScope, type SecretSyncPlan } from "./secret-sync-plan.js";

/**
 * Proof of Operation Store target ownership: revalidation runs only after the
 * caller created the sync Operation and claimed the Sync Target Serialization
 * lease, so the fencing token and Operation ID are required inputs.
 */
export interface SecretSyncExecutionLease {
  readonly operationId: OperationId;
  readonly fencingToken: number;
}

export interface RevalidateSecretSyncPlanInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly plan: SecretSyncPlan;
  readonly lookupPorts: SecretSyncProviderLookupPorts;
  readonly lease: SecretSyncExecutionLease;
  readonly requestId: RequestId;
  /** Approved Protected Change authorizing this run when the environment is protected (INS-87). */
  readonly protectedChangeId?: RequestId;
}

const BLOCKING_LOOKUP_REASON_CODES: Partial<Record<ProviderLookupStatus, KnownErrorCode>> = {
  [PROVIDER_LOOKUP_STATUSES.targetMissing]: PROVIDER_ERROR_CODES.lookupNotFound,
  [PROVIDER_LOOKUP_STATUSES.permissionDenied]: PROVIDER_ERROR_CODES.permissionDenied,
  [PROVIDER_LOOKUP_STATUSES.boundaryMismatch]: PROVIDER_ERROR_CODES.boundaryMismatch,
  [PROVIDER_LOOKUP_STATUSES.unavailable]: PROVIDER_ERROR_CODES.unavailable,
} as const;

function assertLeaseHeld(lease: SecretSyncExecutionLease): void {
  if (!Number.isInteger(lease.fencingToken) || lease.fencingToken <= 0) {
    throw new SecretSyncError(
      OPERATION_ERROR_CODES.leaseRequired,
      "sync plan revalidation requires an acquired sync target lease",
    );
  }
}

function assertFreshLookupsWritable(fresh: SecretSyncPlan): void {
  for (const binding of fresh.bindings) {
    const reasonCode = BLOCKING_LOOKUP_REASON_CODES[binding.lookupStatus];
    if (reasonCode !== undefined) {
      throw new SecretSyncError(
        reasonCode,
        "sync plan revalidation found a binding destination that is not safely writable",
      );
    }
  }
}

function assertPlanStillCurrent(plan: SecretSyncPlan, fresh: SecretSyncPlan): void {
  if (plan.fingerprint !== fresh.fingerprint) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.stalePlan,
      "sync plan no longer matches current configuration and provider lookup status",
    );
  }
}

async function revalidateOrThrow(input: RevalidateSecretSyncPlanInput): Promise<SecretSyncPlan> {
  assertLeaseHeld(input.lease);

  if (input.plan.secretSyncId !== input.secretSyncId) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.stalePlan,
      "sync plan belongs to a different secret sync",
    );
  }

  await resolveSecretSyncRunAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  // Protected Secret Sync run gate (INS-87): runs under the acquired lease, immediately before
  // provider writes. The fresh plan compute below fails closed on any coordinate mismatch, so a
  // requested non-protected environment cannot smuggle a protected sync past this gate.
  await assertProtectedSecretSyncActionApproved("secret_sync_run", input, input.secretSyncId);

  const fresh = await computeSecretSyncPlanInTenantScope({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    secretSyncId: input.secretSyncId,
    lookupPorts: input.lookupPorts,
  });

  assertFreshLookupsWritable(fresh);
  assertPlanStillCurrent(input.plan, fresh);
  return fresh;
}

/**
 * Sync Execution Revalidation: re-runs the metadata-only plan immediately
 * before provider writes, after Operation Store lease acquisition. Stale,
 * missing, unauthorized, and disabled targets fail closed with a stable
 * reason code and an auditable `sync.revalidation_denied` event; provider
 * state is untouched because lookups are metadata-only by construction.
 * A successful revalidation returns the fresh plan and writes no audit event.
 */
export async function revalidateSecretSyncPlanBeforeProviderWrites(
  input: RevalidateSecretSyncPlanInput,
): Promise<SecretSyncPlan> {
  try {
    return await revalidateOrThrow(input);
  } catch (error) {
    await recordSecretSyncRevalidationDenied({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      secretSyncId: input.secretSyncId,
      operationId: input.lease.operationId,
      reasonCode: toSecretSyncAuditReasonCode(error, PROVIDER_ERROR_CODES.unavailable),
      request: { requestId: input.requestId },
    });
    throw error;
  }
}
