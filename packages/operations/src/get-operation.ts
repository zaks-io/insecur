import { withTenantScope } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { GetOperationInput, OperationPollResult } from "./operation-types.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Returns metadata-safe polling output for an Operation ID selector.
 * Operation IDs are not bearer authority; callers must enforce access separately.
 */
export async function getOperation(input: GetOperationInput): Promise<OperationPollResult> {
  const operation = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const store = new TenantOperationStore(sql);
      return await store.getById(input.organizationId, input.operationId);
    },
  );

  if (operation === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }

  return operation;
}
