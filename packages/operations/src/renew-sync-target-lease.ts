import { withTenantScope } from "@insecur/tenant-store";
import type { RenewSyncTargetLeaseInput, SyncTargetLeaseClaimResult } from "./operation-types.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";

/**
 * Extends an active sync target lease between provider writes.
 */
export async function renewSyncTargetLease(
  input: RenewSyncTargetLeaseInput,
): Promise<SyncTargetLeaseClaimResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    async (sql) => {
      const store = new TenantSyncTargetLeaseStore(sql);
      const fencingToken = await store.renewLease({
        target: input.target,
        operationId: input.operationId,
        fencingToken: input.fencingToken,
        ttlSeconds: input.ttlSeconds,
      });
      return { fencingToken, target: input.target };
    },
  );
}
