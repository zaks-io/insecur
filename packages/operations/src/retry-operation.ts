import { withTenantScope } from "@insecur/tenant-store";
import { RETRYABLE_OPERATION_STATES } from "./operation-states.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { OperationMutationResult, RetryOperationInput } from "./operation-types.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Re-enters a resumable Operation through compare-and-set without creating a new Operation ID.
 */
export async function retryOperation(input: RetryOperationInput): Promise<OperationMutationResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantOperationStore(sql);
      const current = await store.getById(input.organizationId, input.operationId);
      if (current === null) {
        throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
      }

      if (
        input.idempotencyKey !== undefined &&
        current.progress.mutationIdempotencyKey === input.idempotencyKey &&
        current.state === "running"
      ) {
        return { operation: current, created: false };
      }

      if (!RETRYABLE_OPERATION_STATES.has(current.state)) {
        throw new OperationStoreError(
          OPERATION_ERROR_CODES.notRetryable,
          `operation in state ${current.state} cannot be retried`,
        );
      }

      const progressPatch =
        input.idempotencyKey !== undefined ? { mutationIdempotencyKey: input.idempotencyKey } : {};

      const operation = await store.compareAndSetTransition({
        organizationId: input.organizationId,
        operationId: input.operationId,
        expectedState: current.state,
        nextState: "running",
        progressPatch,
      });

      return { operation, created: false };
    },
  );
}
