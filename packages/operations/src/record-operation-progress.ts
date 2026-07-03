import type { OperationMutationResult, RecordOperationProgressInput } from "./operation-types.js";
import { validateOperationProgressInput } from "./validate-operation-metadata.js";
import { withOperationProgressMutation } from "./record-operation-progress-mutation.js";

/**
 * Attaches metadata-only progress without changing operation state.
 */
export async function recordOperationProgress(
  input: RecordOperationProgressInput,
): Promise<OperationMutationResult> {
  validateOperationProgressInput(input.progress);

  return await withOperationProgressMutation(
    {
      organizationId: input.organizationId,
      operationId: input.operationId,
      ...(input.lease !== undefined ? { lease: input.lease } : {}),
    },
    async (store) =>
      await store.recordProgress({
        organizationId: input.organizationId,
        operationId: input.operationId,
        progressPatch: input.progress,
      }),
  );
}
