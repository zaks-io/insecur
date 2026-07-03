import type { OperationId, OrganizationId } from "@insecur/domain";
import type { OperationMutationResult, OperationProgressInput } from "./operation-types.js";
import { validateOperationProgressInput } from "./validate-operation-metadata.js";
import { withOperationProgressMutation } from "./record-operation-progress-mutation.js";

export interface RecordOperationProgressClearEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly challengeId: string;
  readonly progress: OperationProgressInput;
}

/**
 * Persists cleared high-assurance challenge evidence with compare-and-set on
 * waiting_for_human + unconsumed pending evidence for the bound challenge id.
 */
export async function recordOperationProgressClearHighAssuranceChallenge(
  input: RecordOperationProgressClearEvidenceInput,
): Promise<OperationMutationResult> {
  validateOperationProgressInput(input.progress);

  return await withOperationProgressMutation(
    {
      organizationId: input.organizationId,
      operationId: input.operationId,
    },
    async (store) =>
      await store.recordClearHighAssuranceProgress({
        organizationId: input.organizationId,
        operationId: input.operationId,
        challengeId: input.challengeId,
        progressPatch: input.progress,
      }),
  );
}
