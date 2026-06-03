import { withTenantScope } from "@insecur/tenant-store";
import { CANCELABLE_OPERATION_STATES } from "./operation-states.js";
import { OPERATION_ERROR_CODES } from "./operation-errors.js";
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
    async ({ sql }) => {
      const store = new TenantOperationStore(sql);

      const operation = await store.applyTransition({
        organizationId: input.organizationId,
        operationId: input.operationId,
        nextState: "canceled",
        progressPatch: {},
        legalFromStates: CANCELABLE_OPERATION_STATES,
        notAllowedError: {
          code: OPERATION_ERROR_CODES.notCancelable,
          message: (state) => `operation in state ${state} cannot be canceled`,
        },
      });

      return { operation, created: false };
    },
  );
}
