import type { OrganizationId } from "@insecur/domain";
import { withTenantScope, type TenantScopedSql } from "@insecur/tenant-store";
import { type OperationRecord, toOperationPollResult } from "./operation-row.js";
import type { OperationMutationResult } from "./operation-types.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

export async function withOperationTransitionMutation(
  organizationId: OrganizationId,
  run: (store: TenantOperationStore, sql: TenantScopedSql) => Promise<OperationRecord>,
): Promise<OperationMutationResult> {
  return await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const store = new TenantOperationStore(sql);
    const operation = await run(store, sql);
    return { operation: toOperationPollResult(operation), created: false };
  });
}
