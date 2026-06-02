import { withTenantScope } from "@insecur/tenant-store";
import { CANCELABLE_OPERATION_STATES } from "./operation-states.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { CancelOperationInput, OperationMutationResult } from "./operation-types.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Closes a cancelable Operation through compare-and-set state.
 */
export async function cancelOperation(
  input: CancelOperationInput,
): Promise<OperationMutationResult> {
  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantOperationStore(sql);
      const current = await store.getById(input.organizationId, input.operationId);
      if (current === null) {
        throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
      }

      if (!CANCELABLE_OPERATION_STATES.has(current.state)) {
        throw new OperationStoreError(
          OPERATION_ERROR_CODES.notCancelable,
          `operation in state ${current.state} cannot be canceled`,
        );
      }

      const operation = await store.compareAndSetTransition({
        organizationId: input.organizationId,
        operationId: input.operationId,
        expectedState: current.state,
        nextState: "canceled",
        progressPatch: {},
      });

      return { operation, created: false };
    },
  );
}
