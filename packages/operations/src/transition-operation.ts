import { withTenantScope } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES } from "./operation-errors.js";
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
      const operation = await store.applyTransition({
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
      });

      return { operation, created: false };
    },
  );
}
