import { withTenantScope } from "@insecur/tenant-store";
import type { ClaimSyncTargetLeaseInput, SyncTargetLeaseClaimResult } from "./operation-types.js";
import { persistOperationSyncTargetLease } from "./persist-operation-sync-target-lease.js";
import { resolveOperationLiveness } from "./resolve-operation-liveness.js";
import { selectSyncTargetLease } from "./sync-target-lease-persistence.js";
import { TenantOperationStore } from "./tenant-operation-store.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";

/**
 * Claims a Sync Target Serialization lease and returns a monotonic fencing token.
 */
export async function claimSyncTargetLease(
  input: ClaimSyncTargetLeaseInput,
): Promise<SyncTargetLeaseClaimResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    async ({ sql }) => {
      const operationStore = new TenantOperationStore(sql);
      const existingLease = await selectSyncTargetLease(sql, input.target);
      if (existingLease !== null) {
        const holder = await operationStore.getById(
          input.target.organizationId,
          existingLease.held_by_operation_id,
        );
        if (holder !== null) {
          await resolveOperationLiveness(sql, holder);
        }
      }

      const store = new TenantSyncTargetLeaseStore(sql);
      const fencingToken = await store.claimLease({
        target: input.target,
        operationId: input.operationId,
        ttlSeconds: input.ttlSeconds,
      });
      await persistOperationSyncTargetLease(sql, {
        organizationId: input.target.organizationId,
        operationId: input.operationId,
        target: input.target,
        fencingToken,
      });
      await operationStore.clearExecutionDeadline({
        organizationId: input.target.organizationId,
        operationId: input.operationId,
      });
      return { fencingToken, target: input.target };
    },
  );
}
