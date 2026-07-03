import { OPERATION_ERROR_CODES } from "./operation-errors.js";
import type { OperationMutationResult, TransitionOperationInput } from "./operation-types.js";
import { validateOperationProgressInput } from "./validate-operation-metadata.js";
import { enforceSyncTargetLease } from "./enforce-sync-target-lease.js";
import { withOperationTransitionMutation } from "./transition-operation-store.js";
import { buildTransitionProgressPatch } from "./transition-operation-progress-patch.js";

/**
 * Compare-and-set state transition with metadata-only progress updates.
 */
export async function transitionOperation(
  input: TransitionOperationInput,
): Promise<OperationMutationResult> {
  const progressPatch = buildTransitionProgressPatch(input);
  validateOperationProgressInput(progressPatch);

  return await withOperationTransitionMutation(input.organizationId, async (store, sql) =>
    store.applyTransition({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: input.nextState,
      progressPatch,
      legalFromStates: "by-transition-table",
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: (state) => `operation transition not allowed: ${state} -> ${input.nextState}`,
      },
      beforeTransition: async (current) => {
        await enforceSyncTargetLease(sql, {
          organizationId: input.organizationId,
          operationId: input.operationId,
          lease: input.lease,
          operation: current,
        });
      },
      ...(input.idempotencyKey === undefined
        ? {}
        : {
            idempotency: {
              key: input.idempotencyKey,
              alreadyAppliedWhen: (current) => current.state === input.nextState,
            },
          }),
    }),
  );
}
