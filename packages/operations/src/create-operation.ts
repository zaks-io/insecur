import { withTenantScope } from "@insecur/tenant-store";
import type { CreateOperationInput, OperationMutationResult } from "./operation-types.js";
import {
  validateOperationIntentCode,
  validateOperationProgressInput,
} from "./validate-operation-metadata.js";
import { toOperationPollResult } from "./operation-row.js";
import { generateOperationId, TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Creates a tenant-qualified Operation or returns the existing row for the same idempotency key.
 */
export async function createOperation(
  input: CreateOperationInput,
): Promise<OperationMutationResult> {
  validateOperationIntentCode(input.intentCode);
  const initialProgress = input.progress ?? {};
  validateOperationProgressInput(initialProgress);

  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const store = new TenantOperationStore(sql);
      const { operation, created } = await store.insertOperationStart({
        operationId: generateOperationId(),
        organizationId: input.organizationId,
        intentCode: input.intentCode,
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
        progress: initialProgress,
      });
      return { operation: toOperationPollResult(operation), created };
    },
  );
}
