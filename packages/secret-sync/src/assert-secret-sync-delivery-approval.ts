import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import type { RequestId } from "@insecur/domain";
import {
  enforceProtectedDeliveryApproval,
  type ProtectedDeliveryTarget,
} from "@insecur/protected-change";
import {
  TenantEnvironmentLifecycleStore,
  withTenantScope,
  type SecretSyncRow,
} from "@insecur/tenant-store";

/**
 * Which protected Secret Sync execution is being authorized: enabling a protected sync or running
 * it. Both are protected delivery configuration actions and require current approval evidence
 * (INS-87). Cloudflare Worker Secret Deploy impact from an already-enabled sync runs under this
 * same sync-run authorization, not a second approval (see docs/protected-change-orchestration.md).
 */
export type ProtectedSecretSyncAction = "secret_sync_enable" | "secret_sync_run";

export interface AssertSecretSyncDeliveryApprovalInput {
  readonly action: ProtectedSecretSyncAction;
  readonly sync: SecretSyncRow;
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly requestId: RequestId;
  /** The Protected Change / Approval Request authorizing this exact sync execution. */
  readonly protectedChangeId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

async function isProtectedEnvironment(sync: SecretSyncRow): Promise<boolean> {
  const environment = await withTenantScope(
    { kind: "organization", organizationId: sync.organizationId },
    ({ db }) =>
      new TenantEnvironmentLifecycleStore(db).getById(sync.organizationId, sync.environmentId),
  );
  return environment?.isProtected ?? false;
}

/**
 * Fail-closed approval gate for protected Secret Sync enable/run (INS-87). When the sync's
 * environment is a Protected Environment, requires current matching approval evidence scoped to the
 * exact tenant, project, Protected Environment, operation kind, and Secret Sync id before the
 * enable/run may proceed. Non-protected development syncs are not gated here — the local First Value
 * loop stays open — but they still pass every other executable and Storage Security Gate check.
 */
export async function assertSecretSyncDeliveryApproval(
  input: AssertSecretSyncDeliveryApprovalInput,
): Promise<void> {
  if (!(await isProtectedEnvironment(input.sync))) {
    return;
  }

  const target: ProtectedDeliveryTarget = {
    organizationId: input.sync.organizationId,
    projectId: input.sync.projectId,
    environmentId: input.sync.environmentId,
    kind: input.action,
    targetId: input.sync.id,
  };

  await enforceProtectedDeliveryApproval({
    target,
    protectedChangeId: input.protectedChangeId,
    actor: input.actor,
    auditActor: input.auditActor,
    requestId: input.requestId,
    ...(input.deps === undefined ? {} : { deps: input.deps }),
  });
}
