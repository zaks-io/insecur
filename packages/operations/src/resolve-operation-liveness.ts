import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { casApplyOperationTransition } from "./apply-operation-transition.js";
import { isIsoTimestampExpired } from "./operation-execution-deadline.js";
import { OPERATION_ERROR_CODES } from "./operation-errors.js";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import type { OperationRecord } from "./operation-row.js";
import type { OperationPollResult } from "./operation-types.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";
import type { SyncTargetLeaseSnapshot } from "./sync-target-lease-row.js";

function operationUsesSyncTargetLeaseClaim(
  operation: OperationPollResult,
  activeLease: SyncTargetLeaseSnapshot | null,
): boolean {
  return activeLease !== null || operation.progress.syncTargetLease !== undefined;
}

export function isOperationExecutionClaimExpired(
  operation: OperationPollResult,
  activeLease: SyncTargetLeaseSnapshot | null,
  now: Date = new Date(),
): boolean {
  if (operation.state !== "running") {
    return false;
  }

  if (operationUsesSyncTargetLeaseClaim(operation, activeLease)) {
    if (activeLease === null) {
      return false;
    }
    return isIsoTimestampExpired(activeLease.expiresAt, now);
  }

  if (operation.executionDeadline === undefined) {
    return false;
  }
  return isIsoTimestampExpired(operation.executionDeadline, now);
}

function buildAbandonedIncompleteProgress(
  existing: OperationPollResult["progress"],
): OperationPollResult["progress"] {
  return mergeOperationProgress(existing, {
    cause: "retryable",
    abandoned: true,
  });
}

/**
 * Parks an expired non-lease or expired-lease `running` Operation to `incomplete` with abandoned
 * metadata. No-ops when the claim is still live.
 */
export async function parkAbandonedRunningOperation(
  sql: TenantScopedSql,
  operation: OperationRecord,
  activeLease: SyncTargetLeaseSnapshot | null,
  now: Date = new Date(),
): Promise<OperationRecord> {
  if (!isOperationExecutionClaimExpired(operation, activeLease, now)) {
    return operation;
  }

  return await casApplyOperationTransition(sql, operation, {
    organizationId: operation.organizationId,
    operationId: operation.operationId,
    nextState: "incomplete",
    progressPatch: buildAbandonedIncompleteProgress(operation.progress),
    legalFromStates: new Set(["running"]),
    notAllowedError: {
      code: OPERATION_ERROR_CODES.invalidTransition,
      message: () => "abandoned operation parking transition not allowed",
    },
    executionDeadline: null,
  });
}

export async function findActiveLeaseForOperation(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  operationId: OperationId,
): Promise<SyncTargetLeaseSnapshot | null> {
  const leaseStore = new TenantSyncTargetLeaseStore(sql);
  return await leaseStore.findActiveLeaseHeldByOperation({ organizationId, operationId });
}

/**
 * Evaluates execution-claim liveness and parks abandoned `running` Operations before reads or
 * claims return stale state.
 */
export async function resolveOperationLiveness(
  sql: TenantScopedSql,
  operation: OperationRecord,
  now: Date = new Date(),
): Promise<OperationRecord> {
  const activeLease = await findActiveLeaseForOperation(
    sql,
    operation.organizationId,
    operation.operationId,
  );
  return await parkAbandonedRunningOperation(sql, operation, activeLease, now);
}
