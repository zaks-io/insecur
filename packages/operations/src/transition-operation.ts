import { withTenantScope } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { OperationMutationResult, TransitionOperationInput } from "./operation-types.js";
import { validateOperationProgressInput } from "./validate-operation-metadata.js";
import { enforceSyncTargetLease } from "./enforce-sync-target-lease.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

function buildProgressPatch(
  input: TransitionOperationInput,
): NonNullable<TransitionOperationInput["progress"]> {
  const patch = { ...input.progress };
  if (input.idempotencyKey !== undefined) {
    return { ...patch, mutationIdempotencyKey: input.idempotencyKey };
  }
  return patch;
}

/**
 * Compare-and-set state transition with metadata-only progress updates.
 */
export async function transitionOperation(
  input: TransitionOperationInput,
): Promise<OperationMutationResult> {
  const progressPatch = buildProgressPatch(input);
  validateOperationProgressInput(progressPatch);

  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantOperationStore(sql);
      await enforceSyncTargetLease(sql, {
        organizationId: input.organizationId,
        operationId: input.operationId,
        lease: input.lease,
      });

      if (input.idempotencyKey !== undefined) {
        const current = await store.getById(input.organizationId, input.operationId);
        if (current === null) {
          throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
        }
        if (
          current.progress.mutationIdempotencyKey === input.idempotencyKey &&
          current.state === input.nextState
        ) {
          return { operation: current, created: false };
        }
      }

      const operation = await store.compareAndSetTransition({
        organizationId: input.organizationId,
        operationId: input.operationId,
        expectedState: input.expectedState,
        nextState: input.nextState,
        progressPatch,
      });

      return { operation, created: false };
    },
  );
}
