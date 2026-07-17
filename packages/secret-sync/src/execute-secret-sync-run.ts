import {
  OPERATION_ERROR_CODES,
  PROVIDER_ERROR_CODES,
  SECRET_SYNC_ERROR_CODES,
} from "@insecur/domain";
import {
  claimSyncTargetLease,
  releaseSyncTargetLease,
  transitionOperation,
  type SyncTargetLeaseContext,
} from "@insecur/operations";

import { resolveProviderWritePort } from "./provider-sync-write-port.js";
import { revalidateSecretSyncPlanBeforeProviderWrites } from "./revalidate-secret-sync-plan.js";
import type { RunSecretSyncCommandResult } from "./run-secret-sync-command.js";
import {
  auditRunDenied,
  emptyCounters,
  parkBlocked,
  runResult,
  toRunReasonCode,
  type SecretSyncRunSession,
} from "./run-secret-sync-session.js";
import { finalizeComplete, finalizeIncomplete } from "./finalize-secret-sync-run.js";
import {
  commitStagedDeploy,
  writeBindings,
  type WriteLoopContext,
} from "./secret-sync-write-loop.js";
import { computeSecretSyncPlanInTenantScope, type SecretSyncPlan } from "./secret-sync-plan.js";
import type { SecretSyncBindingWriteMaterial } from "./secret-sync-write-materials.js";

/** Sync Target Serialization lease TTL for Inline Sync Execution (ADR-0057/0073). */
const SYNC_RUN_LEASE_TTL_SECONDS = 300;

type Phase<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly result: RunSecretSyncCommandResult };

async function computeFreshPlan(session: SecretSyncRunSession): Promise<Phase<SecretSyncPlan>> {
  let plan: SecretSyncPlan;
  try {
    plan = await computeSecretSyncPlanInTenantScope({
      organizationId: session.input.organizationId,
      projectId: session.input.projectId,
      environmentId: session.input.environmentId,
      secretSyncId: session.input.secretSyncId,
      lookupPorts: session.input.lookupPorts,
    });
  } catch (error) {
    return {
      ok: false,
      result: await parkBlocked(session, toRunReasonCode(error, PROVIDER_ERROR_CODES.unavailable)),
    };
  }
  const expected = session.input.expectedPlanFingerprint;
  if (expected !== undefined && expected !== plan.fingerprint) {
    return { ok: false, result: await parkBlocked(session, SECRET_SYNC_ERROR_CODES.stalePlan) };
  }
  return { ok: true, value: plan };
}

async function claimRunLease(
  session: SecretSyncRunSession,
): Promise<Phase<SyncTargetLeaseContext>> {
  try {
    const claim = await claimSyncTargetLease({
      target: session.target,
      operationId: session.operationId,
      ttlSeconds: SYNC_RUN_LEASE_TTL_SECONDS,
    });
    return { ok: true, value: { target: claim.target, fencingToken: claim.fencingToken } };
  } catch (error) {
    return {
      ok: false,
      result: await parkBlocked(session, toRunReasonCode(error, OPERATION_ERROR_CODES.targetBusy)),
    };
  }
}

/** Concurrent cancellation between create and start closes out with zero live effects. */
async function startRunning(
  session: SecretSyncRunSession,
  lease: SyncTargetLeaseContext,
): Promise<Phase<undefined>> {
  try {
    await transitionOperation({
      organizationId: session.input.organizationId,
      operationId: session.operationId,
      nextState: "running",
      lease,
    });
    return { ok: true, value: undefined };
  } catch (error) {
    await releaseSyncTargetLease({
      target: session.target,
      operationId: session.operationId,
      fencingToken: lease.fencingToken,
    });
    const reasonCode = toRunReasonCode(error, OPERATION_ERROR_CODES.invalidTransition);
    const auditEventId = await auditRunDenied(session, reasonCode);
    return {
      ok: false,
      result: runResult(session, "canceled", emptyCounters(session.bindings.length), {
        resultCode: reasonCode,
        auditEventId,
      }),
    };
  }
}

async function revalidateUnderLease(
  session: SecretSyncRunSession,
  plan: SecretSyncPlan,
  lease: SyncTargetLeaseContext,
): Promise<Phase<SecretSyncPlan>> {
  try {
    const fresh = await revalidateSecretSyncPlanBeforeProviderWrites({
      actor: session.input.actor,
      organizationId: session.input.organizationId,
      projectId: session.input.projectId,
      environmentId: session.input.environmentId,
      secretSyncId: session.input.secretSyncId,
      plan,
      lookupPorts: session.input.lookupPorts,
      lease: { operationId: session.operationId, fencingToken: lease.fencingToken },
      requestId: session.input.requestId,
      ...(session.input.protectedChangeId !== undefined
        ? { protectedChangeId: session.input.protectedChangeId }
        : {}),
    });
    return { ok: true, value: fresh };
  } catch (error) {
    const reasonCode = toRunReasonCode(error, PROVIDER_ERROR_CODES.unavailable);
    return { ok: false, result: await parkBlocked(session, reasonCode, lease) };
  }
}

function resolveWritePortPhase(
  session: SecretSyncRunSession,
): ReturnType<typeof resolveProviderWritePort> | null {
  try {
    return resolveProviderWritePort(session.input.writePorts, session.sync.kind);
  } catch {
    return null;
  }
}

/**
 * Decrypt happens only here, after Sync Execution Revalidation, immediately
 * before the provider writes (ADR-0016/ADR-0071); the All-Or-Nothing Sync
 * Pre-Write Gate validates every destination before the first write.
 */
async function resolveGatedMaterials(
  context: WriteLoopContext,
): Promise<Phase<readonly SecretSyncBindingWriteMaterial[]>> {
  const { session } = context;
  try {
    const materials = await session.input.writeMaterialsResolver.resolveWriteMaterials({
      organizationId: session.input.organizationId,
      projectId: session.input.projectId,
      environmentId: session.input.environmentId,
      secretSyncId: session.input.secretSyncId,
      bindings: session.bindings.map((binding) => ({
        bindingId: binding.id,
        secretId: binding.secretId,
      })),
    });
    for (const material of materials) {
      context.writePort.assertWritableDestination({
        destinationName: material.destinationName,
        valueByteLength: material.value.unwrapUtf8().length,
      });
    }
    return { ok: true, value: materials };
  } catch (error) {
    const reasonCode = toRunReasonCode(error, SECRET_SYNC_ERROR_CODES.sourceValueMissing);
    return { ok: false, result: await parkBlocked(session, reasonCode, context.lease) };
  }
}

interface PreparedRun {
  readonly plan: SecretSyncPlan;
  readonly context: WriteLoopContext;
  readonly materials: readonly SecretSyncBindingWriteMaterial[];
}

async function startRevalidatedRun(
  session: SecretSyncRunSession,
): Promise<Phase<{ readonly plan: SecretSyncPlan; readonly lease: SyncTargetLeaseContext }>> {
  const planned = await computeFreshPlan(session);
  if (!planned.ok) {
    return planned;
  }
  const leased = await claimRunLease(session);
  if (!leased.ok) {
    return leased;
  }
  const started = await startRunning(session, leased.value);
  if (!started.ok) {
    return started;
  }
  const revalidated = await revalidateUnderLease(session, planned.value, leased.value);
  if (!revalidated.ok) {
    return revalidated;
  }
  return { ok: true, value: { plan: revalidated.value, lease: leased.value } };
}

async function prepareSecretSyncRun(session: SecretSyncRunSession): Promise<Phase<PreparedRun>> {
  const started = await startRevalidatedRun(session);
  if (!started.ok) {
    return started;
  }
  const writePort = resolveWritePortPhase(session);
  if (writePort === null) {
    return {
      ok: false,
      result: await parkBlocked(session, PROVIDER_ERROR_CODES.unavailable, started.value.lease),
    };
  }
  const context: WriteLoopContext = { session, writePort, lease: started.value.lease };
  const materials = await resolveGatedMaterials(context);
  if (!materials.ok) {
    return materials;
  }
  return { ok: true, value: { plan: started.value.plan, context, materials: materials.value } };
}

/** The execution phases of one Inline Sync Execution request, in order. */
export async function executeSecretSyncRun(
  session: SecretSyncRunSession,
): Promise<RunSecretSyncCommandResult> {
  const prepared = await prepareSecretSyncRun(session);
  if (!prepared.ok) {
    return prepared.result;
  }
  const { plan, context, materials } = prepared.value;
  const outcome = await writeBindings(context, materials);
  if (outcome.staleResult !== undefined) {
    return outcome.staleResult;
  }
  if (outcome.failedCount > 0) {
    // One-deploy providers never committed: the staged version stays inert
    // and the deployed provider state is untouched (ADR-0039/ADR-0057).
    return finalizeIncomplete(context, outcome);
  }
  const committed = await commitStagedDeploy(context, outcome);
  if (committed.staleResult !== undefined) {
    return committed.staleResult;
  }
  if (committed.failedCount > 0) {
    return finalizeIncomplete(context, committed);
  }
  return finalizeComplete(context, plan, committed);
}
