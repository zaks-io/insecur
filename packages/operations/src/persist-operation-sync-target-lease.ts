import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import { syncTargetLeaseProgressFromKey } from "./sync-target-lease-operation-progress.js";
import type { FencingToken, SyncTargetKey } from "./sync-target-types.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

export async function persistOperationSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    target: SyncTargetKey;
    fencingToken: FencingToken;
  },
): Promise<void> {
  const store = new TenantOperationStore(sql);
  const current = await store.getById(input.organizationId, input.operationId);
  if (current === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  await store.recordProgress({
    organizationId: input.organizationId,
    operationId: input.operationId,
    progressPatch: {
      syncTargetLease: syncTargetLeaseProgressFromKey(input.target, input.fencingToken),
    },
  });
}

export async function clearOperationSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
  },
): Promise<void> {
  const store = new TenantOperationStore(sql);
  const current = await store.getById(input.organizationId, input.operationId);
  if (current === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }
  if (current.progress.syncTargetLease === undefined) {
    return;
  }

  await store.recordProgress({
    organizationId: input.organizationId,
    operationId: input.operationId,
    progressPatch: { syncTargetLease: null },
  });
}
