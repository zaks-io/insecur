import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import {
  PROTECTED_CHANGE_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretSyncId,
} from "@insecur/domain";
import {
  enforceProtectedDeliveryApproval,
  ProtectedChangeError,
  recordProtectedDeliveryApprovalAudit,
  toAuditActor,
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

/**
 * The metadata-only coordinate of the Secret Sync being enabled or run. A `SecretSyncRow`
 * satisfies this; the create path passes the coordinate directly because the row does not exist
 * yet when the gate runs.
 */
export type SecretSyncDeliveryCoordinate = Pick<
  SecretSyncRow,
  "id" | "organizationId" | "projectId" | "environmentId"
>;

export interface AssertSecretSyncDeliveryApprovalInput {
  readonly action: ProtectedSecretSyncAction;
  readonly sync: SecretSyncDeliveryCoordinate;
  readonly actor: ActorRef;
  readonly requestId: RequestId;
  /**
   * The Protected Change / Approval Request authorizing this exact sync execution. Optional at the
   * command layer so non-protected development syncs need none; a protected execution without one
   * fails closed with `missing_evidence`.
   */
  readonly protectedChangeId?: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}

async function isProtectedEnvironment(sync: SecretSyncDeliveryCoordinate): Promise<boolean> {
  const environment = await withTenantScope(
    { kind: "organization", organizationId: sync.organizationId },
    ({ db }) =>
      new TenantEnvironmentLifecycleStore(db).getById(sync.organizationId, sync.environmentId),
  );
  return environment?.isProtected ?? false;
}

async function missingProtectedChangeDenial(
  actor: ActorRef,
  target: ProtectedDeliveryTarget,
): Promise<ProtectedChangeError> {
  const denial = new ProtectedChangeError(
    PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    "protected secret sync execution requires an approved protected change reference",
  );
  try {
    await recordProtectedDeliveryApprovalAudit({
      outcome: "denied",
      actor: toAuditActor(actor),
      target,
      reasonCode: denial.code,
    });
  } catch {
    // Preserve the fail-closed denial; audit availability must not change the enforcement result.
  }
  return denial;
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

  if (input.protectedChangeId === undefined) {
    throw await missingProtectedChangeDenial(input.actor, target);
  }

  await enforceProtectedDeliveryApproval({
    target,
    protectedChangeId: input.protectedChangeId,
    actor: input.actor,
    auditActor: toAuditActor(input.actor),
    requestId: input.requestId,
    ...(input.deps === undefined ? {} : { deps: input.deps }),
  });
}

/**
 * The slice of a secret-sync command input the approval gate needs. Every command input
 * (create/update/revalidate) satisfies this structurally, so call sites pass their input directly.
 */
export interface ProtectedSecretSyncGateScope {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
  readonly protectedChangeId?: RequestId;
}

/** Command-layer shorthand for {@link assertSecretSyncDeliveryApproval}. */
export async function assertProtectedSecretSyncActionApproved(
  action: ProtectedSecretSyncAction,
  scope: ProtectedSecretSyncGateScope,
  secretSyncId: SecretSyncId,
): Promise<void> {
  await assertSecretSyncDeliveryApproval({
    action,
    sync: {
      id: secretSyncId,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
    },
    actor: scope.actor,
    requestId: scope.requestId,
    ...(scope.protectedChangeId === undefined
      ? {}
      : { protectedChangeId: scope.protectedChangeId }),
  });
}
