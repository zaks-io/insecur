import type { OrganizationId, OperationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { type OperationRecord, toOperationPollResult } from "./operation-row.js";
import type { OperationMutationResult } from "./operation-types.js";
import { enforceSyncTargetLease } from "./enforce-sync-target-lease.js";
import { TenantOperationStore } from "./tenant-operation-store.js";
import type { SyncTargetLeaseContext } from "./sync-target-types.js";

export async function withOperationProgressMutation(
  input: {
    readonly organizationId: OrganizationId;
    readonly operationId: OperationId;
    readonly lease?: SyncTargetLeaseContext;
  },
  run: (store: TenantOperationStore) => Promise<OperationRecord>,
): Promise<OperationMutationResult> {
  const operation = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      await enforceSyncTargetLease(sql, {
        organizationId: input.organizationId,
        operationId: input.operationId,
        lease: input.lease,
      });
      const store = new TenantOperationStore(sql);
      return await run(store);
    },
  );

  return { operation: toOperationPollResult(operation), created: false };
}
