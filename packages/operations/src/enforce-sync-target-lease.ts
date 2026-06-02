import type { OperationId, OrganizationId } from "@insecur/domain";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";
import type { TenantScopedSql } from "@insecur/tenant-store";
import type { SyncTargetLeaseContext } from "./sync-target-types.js";
import { leaseTargetMatchesOperation } from "./sync-target-types.js";

export async function enforceSyncTargetLease(
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    lease: SyncTargetLeaseContext | undefined;
  },
): Promise<void> {
  if (input.lease === undefined) {
    return;
  }

  if (!leaseTargetMatchesOperation(input.lease.target, input)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "lease target organization must match the operation organization",
    );
  }

  const store = new TenantSyncTargetLeaseStore(sql);
  await store.assertLeaseOwnership({
    target: input.lease.target,
    operationId: input.operationId,
    fencingToken: input.lease.fencingToken,
  });
}
