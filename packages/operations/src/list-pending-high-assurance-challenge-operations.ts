import type { OrganizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import type { OperationPollResult } from "./operation-types.js";
import { toOperationPollResult } from "./operation-row.js";
import { TenantOperationStore } from "./tenant-operation-store.js";

/**
 * Lists operations waiting for human review with unconsumed, uncleared challenge evidence.
 * Caller must enforce Effective Access separately; operation IDs are not bearer authority.
 */
export async function listPendingHighAssuranceChallengeOperations(
  organizationId: OrganizationId,
): Promise<readonly OperationPollResult[]> {
  return await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    const store = new TenantOperationStore(sql);
    const operations = await store.listPendingHighAssuranceChallenges(organizationId);
    return operations.map((operation) => toOperationPollResult(operation));
  });
}
