import { withTenantScope } from "@insecur/tenant-store";
import type { ClaimSyncTargetLeaseInput, SyncTargetLeaseClaimResult } from "./operation-types.js";
import { persistOperationSyncTargetLease } from "./persist-operation-sync-target-lease.js";
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
      return { fencingToken, target: input.target };
    },
  );
}
