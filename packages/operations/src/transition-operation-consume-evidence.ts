import type { OperationId, OrganizationId } from "@insecur/domain";
import { OPERATION_ERROR_CODES } from "./operation-errors.js";
import type { OperationMutationResult, OperationProgressInput } from "./operation-types.js";
import { validateOperationProgressInput } from "./validate-operation-metadata.js";
import { withOperationTransitionMutation } from "./transition-operation-store.js";
import { buildTransitionProgressPatch } from "./transition-operation-progress-patch.js";

export interface TransitionOperationConsumeEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly challengeId: string;
  readonly progress: OperationProgressInput;
  readonly idempotencyKey?: string;
}

export async function transitionOperationConsumeHighAssuranceEvidence(
  input: TransitionOperationConsumeEvidenceInput,
): Promise<OperationMutationResult> {
  const progressPatch = buildTransitionProgressPatch(input);
  validateOperationProgressInput(progressPatch);

  return await withOperationTransitionMutation(input.organizationId, async (store) =>
    store.applyTransition({
      organizationId: input.organizationId,
      operationId: input.operationId,
      nextState: "running",
      progressPatch,
      legalFromStates: new Set(["waiting_for_human"]),
      highAssuranceConsumeCas: { challengeId: input.challengeId },
      notAllowedError: {
        code: OPERATION_ERROR_CODES.invalidTransition,
        message: (state) => `high-assurance evidence consume not allowed from state ${state}`,
      },
      ...(input.idempotencyKey === undefined
        ? {}
        : {
            idempotency: {
              key: input.idempotencyKey,
              alreadyAppliedWhen: (current) =>
                current.state === "waiting_for_human" &&
                current.progress.highAssuranceChallenge?.consumedAt !== undefined,
            },
          }),
    }),
  );
}
