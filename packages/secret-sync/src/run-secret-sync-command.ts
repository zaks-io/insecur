import type { UserActorRef } from "@insecur/access";
import {
  SECRET_SYNC_ERROR_CODES,
  readErrorCode,
  type EnvironmentId,
  type KnownErrorCode,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretSyncId,
} from "@insecur/domain";
import {
  OPERATION_INTENT_CODES,
  createOperation,
  isSyncProviderKind,
  transitionOperation,
  type OperationMutationResult,
  type OperationState,
} from "@insecur/operations";
import { withTenantScope } from "@insecur/tenant-store";

import { resolveSecretSyncRunAccess } from "./assert-secret-sync-access.js";
import { executeSecretSyncRun } from "./execute-secret-sync-run.js";
import { loadExecutableSecretSyncContext } from "./load-executable-secret-sync-context.js";
import type { SecretSyncProviderLookupPorts } from "./provider-lookup-port.js";
import type { SecretSyncProviderWritePorts } from "./provider-sync-write-port.js";
import { recordSecretSyncRunDenied } from "./record-secret-sync-run-audit.js";
import {
  emptyCounters,
  syncTargetKey,
  type SecretSyncRunSession,
} from "./run-secret-sync-session.js";
import { SecretSyncError } from "./secret-sync-error.js";
import type { SecretSyncWriteMaterialsResolver } from "./secret-sync-write-materials.js";

export interface RunSecretSyncCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretSyncId: SecretSyncId;
  readonly lookupPorts: SecretSyncProviderLookupPorts;
  readonly writePorts: SecretSyncProviderWritePorts;
  readonly writeMaterialsResolver: SecretSyncWriteMaterialsResolver;
  readonly requestId: RequestId;
  /** ADR-0066 idempotency key; a retried run returns the existing Operation. */
  readonly idempotencyKey?: string;
  /**
   * Fingerprint of the plan the caller reviewed. When present, the run blocks
   * with `sync.stale_plan` if configuration or provider lookup status changed
   * since that plan; execution always uses a fresh in-request plan either way.
   */
  readonly expectedPlanFingerprint?: string;
  /** Approved Protected Change authorizing this run for a Protected Environment (INS-87). */
  readonly protectedChangeId?: RequestId;
}

/** Metadata-only run outcome: operation status plus safe counters, never values. */
export interface RunSecretSyncCommandResult {
  readonly operationId: OperationId;
  readonly state: OperationState;
  /** False when an idempotent retry returned the existing Operation without new effects. */
  readonly startedExecution: boolean;
  readonly resultCode?: KnownErrorCode;
  readonly totalBindings: number;
  readonly writtenCount: number;
  readonly failedCount: number;
  readonly verifiedCount: number;
  readonly auditEventId?: string;
}

function createRunOperation(input: RunSecretSyncCommandInput): Promise<OperationMutationResult> {
  return createOperation({
    organizationId: input.organizationId,
    intentCode: OPERATION_INTENT_CODES.syncRun,
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
  });
}

function auditScopeFor(input: RunSecretSyncCommandInput) {
  return {
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    request: { requestId: input.requestId },
  };
}

/**
 * A disabled or missing connection is an executable-state failure, not a
 * request error (`sync.connection_not_eligible` maps to a CLI exit code, not
 * an HTTP status): park an auditable blocked Operation with zero effects.
 */
async function parkConnectionNotEligible(
  input: RunSecretSyncCommandInput,
): Promise<RunSecretSyncCommandResult> {
  const created = await createRunOperation(input);
  if (created.created) {
    await transitionOperation({
      organizationId: input.organizationId,
      operationId: created.operation.operationId,
      nextState: "blocked",
      progress: { resultCode: SECRET_SYNC_ERROR_CODES.connectionNotEligible },
    });
  }
  const audit = await recordSecretSyncRunDenied({
    ...auditScopeFor(input),
    secretSyncId: input.secretSyncId,
    operationId: created.operation.operationId,
    reasonCode: SECRET_SYNC_ERROR_CODES.connectionNotEligible,
  });
  return {
    operationId: created.operation.operationId,
    state: created.created ? "blocked" : created.operation.state,
    startedExecution: created.created,
    resultCode: SECRET_SYNC_ERROR_CODES.connectionNotEligible,
    ...emptyCounters(0),
    auditEventId: audit.auditEventId,
  };
}

async function loadRunContext(input: RunSecretSyncCommandInput) {
  const context = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      loadExecutableSecretSyncContext({
        db,
        organizationId: input.organizationId,
        secretSyncId: input.secretSyncId,
      }),
  );
  if (
    context.sync.projectId !== input.projectId ||
    context.sync.environmentId !== input.environmentId
  ) {
    throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, "secret sync not found");
  }
  return context;
}

/**
 * `syncs run` as Inline Sync Execution (ADR-0057): one Operation, the Sync
 * Target Serialization lease, Sync Execution Revalidation, the all-or-nothing
 * pre-write gate, per-binding provider writes with fencing checks, and
 * metadata-only verification, all inside the triggering request. Execution
 * failures surface as Operation state plus a stable `resultCode`; every
 * outcome is auditable and metadata-only.
 */
export async function runSecretSyncCommand(
  input: RunSecretSyncCommandInput,
): Promise<RunSecretSyncCommandResult> {
  await resolveSecretSyncRunAccess(input.actor, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  });

  let context: Awaited<ReturnType<typeof loadRunContext>>;
  try {
    context = await loadRunContext(input);
  } catch (error) {
    if (readErrorCode(error) === SECRET_SYNC_ERROR_CODES.connectionNotEligible) {
      return parkConnectionNotEligible(input);
    }
    throw error;
  }

  const target = syncTargetKey(context.sync, isSyncProviderKind);
  const created = await createRunOperation(input);

  // ADR-0066: a retried start returns the one matching Operation without
  // duplicating live effects. The caller polls or retries by Operation ID.
  if (!created.created) {
    return {
      operationId: created.operation.operationId,
      state: created.operation.state,
      startedExecution: false,
      ...emptyCounters(context.bindings.length),
      ...(created.operation.progress.resultCode !== undefined
        ? { resultCode: created.operation.progress.resultCode }
        : {}),
    };
  }

  const session: SecretSyncRunSession = {
    input,
    auditScope: auditScopeFor(input),
    sync: context.sync,
    connection: context.connection,
    bindings: context.bindings,
    target,
    operationId: created.operation.operationId,
  };
  return executeSecretSyncRun(session);
}
