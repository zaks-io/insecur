import { withTenantScope } from "@insecur/tenant-store";
import type { AssertSyncTargetLeaseInput } from "./operation-types.js";
import { TenantSyncTargetLeaseStore } from "./tenant-sync-target-lease-store.js";

/**
 * Verifies the caller still owns the sync target lease before a provider write or guarded transition.
 */
export async function assertSyncTargetLease(input: AssertSyncTargetLeaseInput): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.target.organizationId },
    async (sql) => {
      const store = new TenantSyncTargetLeaseStore(sql);
      await store.assertLeaseOwnership({
        target: input.target,
        operationId: input.operationId,
        fencingToken: input.fencingToken,
      });
    },
  );
}
