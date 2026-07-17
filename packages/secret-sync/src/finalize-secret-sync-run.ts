import { PROVIDER_ERROR_CODES, SECRET_SYNC_KINDS } from "@insecur/domain";
import { releaseSyncTargetLease, transitionOperation } from "@insecur/operations";

import {
  PROVIDER_LOOKUP_STATUSES,
  lookupExactDestinationSafely,
  resolveProviderLookupPort,
} from "./provider-lookup-port.js";
import {
  recordSecretSyncRunCompleted,
  toRunBindingAuditDetails,
} from "./record-secret-sync-run-audit.js";
import type { RunSecretSyncCommandResult } from "./run-secret-sync-command.js";
import { auditRunDenied, runResult, type SecretSyncRunSession } from "./run-secret-sync-session.js";
import type { SecretSyncPlan } from "./secret-sync-plan.js";
import type { WriteLoopContext, WriteLoopOutcome } from "./secret-sync-write-loop.js";

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
        hasWorkerScriptTarget: session.sync.kind === SECRET_SYNC_KINDS.cloudflareWorkerSecret,
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
    details: toRunBindingAuditDetails(outcome.records, { ...counters }, session.sync.kind),
  });
  return runResult(session, finalState, counters, { auditEventId: audit.auditEventId });
}
