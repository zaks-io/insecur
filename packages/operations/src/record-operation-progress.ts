import { withTenantScope } from "@insecur/tenant-store";
import type { OperationMutationResult, RecordOperationProgressInput } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";
import { enforceSyncTargetLease } from "./enforce-sync-target-lease.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Attaches metadata-only progress without changing operation state.
 */
export async function recordOperationProgress(
  input: RecordOperationProgressInput,
): Promise<OperationMutationResult> {
  validateOperationProgress(input.progress);

  const operation = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      await enforceSyncTargetLease(sql, {
        organizationId: input.organizationId,
        operationId: input.operationId,
        lease: input.lease,
      });
      const store = new TenantOperationStore(sql);
      return await store.recordProgress({
        organizationId: input.organizationId,
        operationId: input.operationId,
        progressPatch: input.progress,
      });
    },
  );

  return { operation, created: false };
}
