import { OPERATION_ERROR_CODES, PROVIDER_ERROR_CODES } from "@insecur/domain";
import {
  assertSyncTargetLease,
  recordOperationProgress,
  releaseSyncTargetLease,
  transitionOperation,
  type SyncTargetLeaseContext,
} from "@insecur/operations";

import {
  PROVIDER_LOOKUP_STATUSES,
  lookupExactDestinationSafely,
  resolveProviderLookupPort,
} from "./provider-lookup-port.js";
import {
  PROVIDER_WRITE_STATUSES,
  isActionRequiredWriteStatus,
  writeExactDestinationSafely,
  type SecretSyncProviderWritePort,
} from "./provider-sync-write-port.js";
import {
  recordSecretSyncRunCompleted,
  toRunBindingAuditDetails,
} from "./record-secret-sync-run-audit.js";
import type { RunSecretSyncCommandResult } from "./run-secret-sync-command.js";
import {
  PROVIDER_CODE_BY_WRITE_STATUS,
  auditRunDenied,
  runResult,
  toRunReasonCode,
  type BindingWriteRecord,
  type SecretSyncRunSession,
} from "./run-secret-sync-session.js";
import type { SecretSyncPlan } from "./secret-sync-plan.js";
import type { SecretSyncBindingWriteMaterial } from "./secret-sync-write-materials.js";

export interface WriteLoopContext {
  readonly session: SecretSyncRunSession;
  readonly writePort: SecretSyncProviderWritePort;
  readonly lease: SyncTargetLeaseContext;
}

export interface WriteLoopOutcome {
  readonly records: readonly BindingWriteRecord[];
  readonly writtenCount: number;
  readonly failedCount: number;
  readonly actionRequired: boolean;
  readonly lastFailureCode?: (typeof PROVIDER_CODE_BY_WRITE_STATUS)[keyof typeof PROVIDER_CODE_BY_WRITE_STATUS];
  readonly staleResult?: RunSecretSyncCommandResult;
}

/** A stale holder must never write after losing the lease (fencing check per write). */
async function abortStaleWriteLoop(
  context: WriteLoopContext,
  error: unknown,
  outcome: WriteLoopOutcome,
): Promise<RunSecretSyncCommandResult> {
  const { session } = context;
  const reasonCode = toRunReasonCode(error, OPERATION_ERROR_CODES.staleFencingToken);
  const counters = {
    totalBindings: session.bindings.length,
    writtenCount: outcome.writtenCount,
    failedCount: outcome.failedCount,
    verifiedCount: 0,
  };
  const auditEventId = await auditRunDenied(session, reasonCode, outcome.records, counters);
  return runResult(session, "running", counters, { resultCode: reasonCode, auditEventId });
}

async function writeOneBinding(
  context: WriteLoopContext,
  material: SecretSyncBindingWriteMaterial,
  outcome: WriteLoopOutcome,
): Promise<WriteLoopOutcome> {
  const { session } = context;
  const written = await writeExactDestinationSafely(context.writePort, {
    providerKind: session.sync.kind,
    organizationId: session.input.organizationId,
    appConnectionId: session.sync.appConnectionId,
    secretSyncId: session.input.secretSyncId,
    bindingId: material.bindingId,
    githubProviderScope: session.sync.githubProviderScope,
    targetRepoId: session.sync.targetRepoId,
    targetGithubEnvironmentId: session.sync.targetGithubEnvironmentId,
    destinationName: material.destinationName,
    value: material.value,
  });
  const succeeded = written.status === PROVIDER_WRITE_STATUSES.written;
  const lastFailureCode = succeeded
    ? outcome.lastFailureCode
    : PROVIDER_CODE_BY_WRITE_STATUS[written.status];
  const next: WriteLoopOutcome = {
    records: [
      ...outcome.records,
      { bindingId: material.bindingId, secretId: material.secretId, writeStatus: written.status },
    ],
    writtenCount: outcome.writtenCount + (succeeded ? 1 : 0),
    failedCount: outcome.failedCount + (succeeded ? 0 : 1),
    actionRequired: outcome.actionRequired || isActionRequiredWriteStatus(written.status),
    ...(lastFailureCode !== undefined ? { lastFailureCode } : {}),
  };
  await recordOperationProgress({
    organizationId: session.input.organizationId,
    operationId: session.operationId,
    progress: {
      counters: {
        totalBindings: session.bindings.length,
        writtenCount: next.writtenCount,
        failedCount: next.failedCount,
      },
      ...(next.lastFailureCode !== undefined ? { providerStatusCode: next.lastFailureCode } : {}),
    },
    lease: context.lease,
  });
  return next;
}

export async function writeBindings(
  context: WriteLoopContext,
  materials: readonly SecretSyncBindingWriteMaterial[],
): Promise<WriteLoopOutcome> {
  let outcome: WriteLoopOutcome = {
    records: [],
    writtenCount: 0,
    failedCount: 0,
    actionRequired: false,
  };
  for (const material of materials) {
    try {
      await assertSyncTargetLease({
        target: context.session.target,
        operationId: context.session.operationId,
        fencingToken: context.lease.fencingToken,
      });
    } catch (error) {
      return { ...outcome, staleResult: await abortStaleWriteLoop(context, error, outcome) };
    }
    outcome = await writeOneBinding(context, material, outcome);
  }
  return outcome;
}

/** Metadata-only verification: key presence via Explicit Provider Lookup, never value readback. */
async function verifyWrittenDestinations(
  session: SecretSyncRunSession,
  plan: SecretSyncPlan,
): Promise<number> {
  try {
    const lookupPort = resolveProviderLookupPort(session.input.lookupPorts, session.sync.kind);
    let verifiedCount = 0;
    for (const binding of plan.bindings) {
      const lookup = await lookupExactDestinationSafely(lookupPort, {
        providerKind: session.sync.kind,
        organizationId: session.input.organizationId,
        appConnectionId: session.sync.appConnectionId,
        secretSyncId: session.input.secretSyncId,
        bindingId: binding.bindingId,
        githubProviderScope: session.sync.githubProviderScope,
        targetRepoId: session.sync.targetRepoId,
        targetGithubEnvironmentId: session.sync.targetGithubEnvironmentId,
        hasWorkerScriptTarget: false,
      });
      verifiedCount += lookup.status === PROVIDER_LOOKUP_STATUSES.found ? 1 : 0;
    }
    return verifiedCount;
  } catch {
    return 0;
  }
}

/** Incomplete Sync Run: resumable by the same Operation ID, no rollback, no dead-letter path. */
export async function finalizeIncomplete(
  context: WriteLoopContext,
  outcome: WriteLoopOutcome,
): Promise<RunSecretSyncCommandResult> {
  const { session, lease } = context;
  const resultCode = outcome.lastFailureCode ?? PROVIDER_ERROR_CODES.unavailable;
  await transitionOperation({
    organizationId: session.input.organizationId,
    operationId: session.operationId,
    nextState: "incomplete",
    progress: { cause: outcome.actionRequired ? "action_required" : "retryable", resultCode },
    lease,
  });
  await releaseSyncTargetLease({
    target: session.target,
    operationId: session.operationId,
    fencingToken: lease.fencingToken,
  });
  const counters = {
    totalBindings: session.bindings.length,
    writtenCount: outcome.writtenCount,
    failedCount: outcome.failedCount,
    verifiedCount: 0,
  };
  const auditEventId = await auditRunDenied(session, resultCode, outcome.records, counters);
  return runResult(session, "incomplete", counters, { resultCode, auditEventId });
}

export async function finalizeComplete(
  context: WriteLoopContext,
  plan: SecretSyncPlan,
  outcome: WriteLoopOutcome,
): Promise<RunSecretSyncCommandResult> {
  const { session, lease } = context;
  const verifiedCount = await verifyWrittenDestinations(session, plan);
  const counters = {
    totalBindings: session.bindings.length,
    writtenCount: outcome.writtenCount,
    failedCount: 0,
    verifiedCount,
  };
  const finalState =
    verifiedCount === counters.totalBindings ? "succeeded" : "completed_with_warnings";
  await transitionOperation({
    organizationId: session.input.organizationId,
    operationId: session.operationId,
    nextState: finalState,
    progress: { counters: { ...counters } },
    lease,
  });
  await releaseSyncTargetLease({
    target: session.target,
    operationId: session.operationId,
    fencingToken: lease.fencingToken,
  });
  const audit = await recordSecretSyncRunCompleted({
    ...session.auditScope,
    secretSyncId: session.input.secretSyncId,
    operationId: session.operationId,
    details: toRunBindingAuditDetails(outcome.records, { ...counters }),
  });
  return runResult(session, finalState, counters, { auditEventId: audit.auditEventId });
}
