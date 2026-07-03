import type { OperationProgressInput } from "./operation-types.js";

export function buildTransitionProgressPatch(input: {
  readonly progress?: OperationProgressInput;
  readonly idempotencyKey?: string;
}): OperationProgressInput {
  const patch = { ...input.progress };
  if (input.idempotencyKey !== undefined) {
    return { ...patch, mutationIdempotencyKey: input.idempotencyKey };
  }
  return patch;
}
