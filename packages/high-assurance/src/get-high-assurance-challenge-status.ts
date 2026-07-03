import { OPERATION_ERROR_CODES, OperationStoreError, getOperation } from "@insecur/operations";
import type { GetHighAssuranceChallengeStatusInput } from "./high-assurance-challenge-inputs.js";
import type { HighAssuranceChallengeStatus } from "./high-assurance-challenge-types.js";
import { resolveHighAssuranceChallengeStatus } from "./resolve-high-assurance-challenge-status.js";

export type { GetHighAssuranceChallengeStatusInput } from "./high-assurance-challenge-inputs.js";

export async function getHighAssuranceChallengeStatus(
  input: GetHighAssuranceChallengeStatusInput,
): Promise<HighAssuranceChallengeStatus | null> {
  try {
    const operation = await getOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
    });

    return resolveHighAssuranceChallengeStatus({
      operationId: input.operationId,
      ...(operation.progress.highAssuranceChallenge !== undefined
        ? { highAssuranceChallenge: operation.progress.highAssuranceChallenge }
        : {}),
      ...(input.now !== undefined ? { now: input.now } : {}),
    });
  } catch (error) {
    if (error instanceof OperationStoreError && error.code === OPERATION_ERROR_CODES.notFound) {
      return null;
    }
    throw error;
  }
}
