import { OPERATION_ERROR_CODES } from "@insecur/domain";
import {
  assertSyncTargetLease,
  recordOperationProgress,
  type SyncTargetLeaseContext,
} from "@insecur/operations";

import {
  PROVIDER_WRITE_STATUSES,
  commitStagedWritesSafely,
  isActionRequiredWriteStatus,
  writeExactDestinationSafely,
  type SecretSyncProviderWritePort,
} from "./provider-sync-write-port.js";
import type { RunSecretSyncCommandResult } from "./run-secret-sync-command.js";
import {
  PROVIDER_CODE_BY_WRITE_STATUS,
  auditRunDenied,
  runResult,
  toRunReasonCode,
  type BindingWriteRecord,
  type SecretSyncRunSession,
} from "./run-secret-sync-session.js";
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
  await recordWriteProgress(context, next);
  return next;
}

async function recordWriteProgress(
  context: WriteLoopContext,
  outcome: WriteLoopOutcome,
): Promise<void> {
  const { session } = context;
  await recordOperationProgress({
    organizationId: session.input.organizationId,
    operationId: session.operationId,
    progress: {
      counters: {
        totalBindings: session.bindings.length,
        writtenCount: outcome.writtenCount,
        failedCount: outcome.failedCount,
      },
      ...(outcome.lastFailureCode !== undefined
        ? { providerStatusCode: outcome.lastFailureCode }
        : {}),
    },
    lease: context.lease,
  });
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

/**
 * ADR-0039/ADR-0057 single-deploy commit: a provider with one-deploy-per-run
 * semantics (Cloudflare Worker secrets) staged every binding during the write
 * loop and lands the whole set here in exactly one deploy. Per-binding
 * providers have no staged-commit seam, so the outcome passes through. A
 * failed commit means no binding reached the deployed provider state: every
 * binding record is downgraded to the commit failure status and the run
 * parks incomplete for a full restaged re-run.
 */
export async function commitStagedDeploy(
  context: WriteLoopContext,
  outcome: WriteLoopOutcome,
): Promise<WriteLoopOutcome> {
  const { session } = context;
  if (context.writePort.commitStagedWrites === undefined) {
    return outcome;
  }
  try {
    await assertSyncTargetLease({
      target: session.target,
      operationId: session.operationId,
      fencingToken: context.lease.fencingToken,
    });
  } catch (error) {
    return { ...outcome, staleResult: await abortStaleWriteLoop(context, error, outcome) };
  }
  const committed = await commitStagedWritesSafely(context.writePort, {
    providerKind: session.sync.kind,
    organizationId: session.input.organizationId,
    appConnectionId: session.sync.appConnectionId,
    secretSyncId: session.input.secretSyncId,
  });
  if (committed.status === PROVIDER_WRITE_STATUSES.written) {
    return outcome;
  }
  const failed: WriteLoopOutcome = {
    records: outcome.records.map((record) => ({ ...record, writeStatus: committed.status })),
    writtenCount: 0,
    failedCount: outcome.records.length,
    actionRequired: isActionRequiredWriteStatus(committed.status),
    lastFailureCode: PROVIDER_CODE_BY_WRITE_STATUS[committed.status],
  };
  await recordWriteProgress(context, failed);
  return failed;
}
