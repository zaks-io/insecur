import { withTenantScope } from "@insecur/tenant-store";
import { RETRYABLE_OPERATION_STATES } from "./operation-states.js";
import { OPERATION_ERROR_CODES } from "./operation-errors.js";
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

      const progressPatch =
        input.idempotencyKey !== undefined ? { mutationIdempotencyKey: input.idempotencyKey } : {};

      const operation = await store.applyTransition({
        organizationId: input.organizationId,
        operationId: input.operationId,
        nextState: "running",
        progressPatch,
        legalFromStates: RETRYABLE_OPERATION_STATES,
        notAllowedError: {
          code: OPERATION_ERROR_CODES.notRetryable,
          message: (state) => `operation in state ${state} cannot be retried`,
        },
        ...(input.idempotencyKey === undefined
          ? {}
          : {
              idempotency: {
                key: input.idempotencyKey,
                alreadyAppliedWhen: (current) => current.state === "running",
              },
            }),
      });

      return { operation, created: false };
    },
  );
}
