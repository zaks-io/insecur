import {
  completeBootstrapOperatorClaim,
  type CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";
import type { CompleteBootstrapClaimRpcInput, RuntimeRpcResult } from "@insecur/worker-kit";

import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";

export function completeBootstrapOperatorClaimRpc(
  post: PostAuthRpcRunner,
  input: CompleteBootstrapClaimRpcInput,
): Promise<RuntimeRpcResult<CompleteBootstrapOperatorClaimResult>> {
  return post(input.actorToken, ({ actor }) =>
    completeBootstrapOperatorClaim({
      instanceId: input.instanceId,
      actor,
      bootstrapSecret: input.bootstrapSecret,
      operatorGrantId: input.operatorGrantId,
      ownerMembershipId: input.ownerMembershipId,
      request: { requestId: input.requestId },
    }),
  );
}
