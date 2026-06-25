import type { OrganizationId, TeamId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { executeBootstrapClaimInTransaction } from "./execute-bootstrap-claim-in-transaction.js";
import type {
  BootstrapStatusComplete,
  CompleteBootstrapOperatorClaimInput,
  CompleteBootstrapOperatorClaimResult,
} from "./bootstrap-types.js";

export interface AtomicallyCompleteBootstrapClaimResult {
  claimId: string;
  organizationId: OrganizationId;
  status: BootstrapStatusComplete;
}

export async function atomicallyCompleteBootstrapOperatorClaim(
  input: CompleteBootstrapOperatorClaimInput,
  claimContext: {
    organizationId: OrganizationId;
    defaultTeamId: TeamId;
  },
): Promise<AtomicallyCompleteBootstrapClaimResult | null> {
  return withTenantScope({ kind: "service" }, async ({ sql }) =>
    executeBootstrapClaimInTransaction(sql, {
      instanceId: input.instanceId,
      organizationId: claimContext.organizationId,
      actor: input.actor,
      operatorGrantId: input.operatorGrantId,
      ownerMembershipId: input.ownerMembershipId,
      defaultTeamId: claimContext.defaultTeamId,
      ...(input.request !== undefined ? { request: input.request } : {}),
    }),
  );
}

export function toClaimCompletionResult(
  input: CompleteBootstrapOperatorClaimInput,
  completed: AtomicallyCompleteBootstrapClaimResult,
): CompleteBootstrapOperatorClaimResult {
  return {
    instanceId: input.instanceId,
    organizationId: completed.organizationId,
    operatorGrantId: input.operatorGrantId,
    ownerMembershipId: input.ownerMembershipId,
    status: completed.status,
  };
}
