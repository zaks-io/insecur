import { withTenantScope } from "@insecur/tenant-store";
import type { CreateOperationInput, OperationMutationResult } from "./operation-types.js";
import {
  validateOperationIntentCode,
  validateOperationProgress,
} from "./validate-operation-metadata.js";
import { generateOperationId, TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Creates a tenant-qualified Operation or returns the existing row for the same idempotency key.
 */
export async function createOperation(
  input: CreateOperationInput,
): Promise<OperationMutationResult> {
  validateOperationIntentCode(input.intentCode);
  const initialProgress = input.progress ?? {};
  validateOperationProgress(initialProgress);

  return await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      const store = new TenantOperationStore(sql);

      if (input.idempotencyKey !== undefined) {
        const existing = await store.findByIdempotencyKey(
          input.organizationId,
          input.idempotencyKey,
        );
        if (existing !== null) {
          return { operation: existing, created: false };
        }
      }

      const operation = await store.insertOperation({
        operationId: generateOperationId(),
        organizationId: input.organizationId,
        intentCode: input.intentCode,
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
        progress: initialProgress,
      });

      return { operation, created: true };
    },
  );
}
