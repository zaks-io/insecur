import type { UserActor } from "@insecur/auth";
import {
  completeBootstrapOperatorClaim,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import type { CompleteBootstrapClaimRpcInput } from "@insecur/worker-kit";

export interface CompleteBootstrapClaimOperationInput {
  readonly actor: UserActor;
  readonly input: CompleteBootstrapClaimRpcInput;
}

export async function completeBootstrapClaimOperation({
  actor,
  input,
}: CompleteBootstrapClaimOperationInput): Promise<CompleteBootstrapOperatorClaimResult> {
  return completeBootstrapOperatorClaim({
    instanceId: input.instanceId,
    actor,
    bootstrapSecret: input.bootstrapSecret,
    operatorGrantId: input.operatorGrantId,
    ownerMembershipId: input.ownerMembershipId,
    request: { requestId: input.requestId },
  });
}
