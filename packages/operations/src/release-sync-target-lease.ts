import { withTenantScope } from "@insecur/tenant-store";
import type { ReleaseSyncTargetLeaseInput } from "./operation-types.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";

/**
 * Releases a sync target lease after terminal completion, cancellation, or blocked pre-write.
 */
export async function releaseSyncTargetLease(input: ReleaseSyncTargetLeaseInput): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    async (sql) => {
      const store = new TenantSyncTargetLeaseStore(sql);
      await store.releaseLease({
        target: input.target,
        operationId: input.operationId,
        fencingToken: input.fencingToken,
      });
    },
  );
}
