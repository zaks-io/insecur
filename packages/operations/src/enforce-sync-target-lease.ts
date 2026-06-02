import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { OperationSyncTargetLeaseProgress } from "./sync-target-lease-operation-progress.js";
import {
  leaseContextsMatch,
  syncTargetLeaseContextFromProgress,
  syncTargetLeaseProgressFromKey,
} from "./sync-target-lease-operation-progress.js";
import type { SyncTargetLeaseSnapshot } from "./sync-target-lease-row.js";
import { TenantOperationStore } from "./tenant-operation-store.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";
import type { SyncTargetLeaseContext } from "./sync-target-types.js";
import { leaseTargetMatchesOperation } from "./sync-target-types.js";

function resolveRequiredLeaseBinding(
  activeLease: SyncTargetLeaseSnapshot | null,
  progressBinding: OperationSyncTargetLeaseProgress | undefined,
): OperationSyncTargetLeaseProgress | null {
  if (activeLease !== null) {
    return syncTargetLeaseProgressFromKey(activeLease.target, activeLease.fencingToken);
  }
  return progressBinding ?? null;
}

async function assertOptionalLease(
  leaseStore: TenantSyncTargetLeaseStore,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    lease: SyncTargetLeaseContext;
  },
): Promise<void> {
  if (!leaseTargetMatchesOperation(input.lease.target, input)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "lease target organization must match the operation organization",
    );
  }
  await leaseStore.assertLeaseOwnership({
    target: input.lease.target,
    operationId: input.operationId,
    fencingToken: input.lease.fencingToken,
  });
}

async function assertRequiredLease(
  leaseStore: TenantSyncTargetLeaseStore,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    lease: SyncTargetLeaseContext;
    requiredBinding: OperationSyncTargetLeaseProgress;
  },
): Promise<void> {
  if (!leaseTargetMatchesOperation(input.lease.target, input)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "lease target organization must match the operation organization",
    );
  }
  if (!leaseContextsMatch(input.requiredBinding, input.lease)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.staleFencingToken,
      "provided lease does not match the operation sync target binding",
    );
  }
  const expectedContext = syncTargetLeaseContextFromProgress(
    input.organizationId,
    input.requiredBinding,
  );
  await leaseStore.assertLeaseOwnership({
    target: expectedContext.target,
    operationId: input.operationId,
    fencingToken: expectedContext.fencingToken,
  });
}

export async function enforceSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    lease: SyncTargetLeaseContext | undefined;
  },
): Promise<void> {
  const store = new TenantOperationStore(sql);
  const leaseStore = new TenantSyncTargetLeaseStore(sql);
  const operation = await store.getById(input.organizationId, input.operationId);
  if (operation === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  const requiredBinding = resolveRequiredLeaseBinding(
    await leaseStore.findActiveLeaseHeldByOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
    }),
    operation.progress.syncTargetLease,
  );

  if (requiredBinding === null) {
    if (input.lease === undefined) {
      return;
    }
    await assertOptionalLease(leaseStore, { ...input, lease: input.lease });
    return;
  }

  if (input.lease === undefined) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.leaseRequired,
      "sync target lease fencing token is required for this operation",
    );
  }

  await assertRequiredLease(leaseStore, {
    ...input,
    lease: input.lease,
    requiredBinding,
  });
}
