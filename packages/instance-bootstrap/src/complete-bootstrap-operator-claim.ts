import { BOOTSTRAP_ERROR_CODES } from "@insecur/domain";
import { recordBootstrapOperatorClaimDenied } from "./bootstrap-audit.js";
import { BootstrapError } from "./bootstrap-error.js";
import { consumeBootstrapOperatorClaim } from "./bootstrap-store.js";
import type {
  CompleteBootstrapOperatorClaimInput,
  CompleteBootstrapOperatorClaimResult,
} from "./bootstrap-types.js";
import { finalizeBootstrapClaimSuccess } from "./finalize-bootstrap-claim.js";
import { validateBootstrapClaimContext } from "./validate-bootstrap-claim.js";

export async function completeBootstrapOperatorClaim(
  input: CompleteBootstrapOperatorClaimInput,
): Promise<CompleteBootstrapOperatorClaimResult> {
  const claimContext = await validateBootstrapClaimContext(input);

  const consumedResult = await consumeBootstrapOperatorClaim({
    instanceId: input.instanceId,
    userId: input.userId,
    operatorGrantId: input.operatorGrantId,
    ownerMembershipId: input.ownerMembershipId,
    defaultTeamId: claimContext.defaultTeamId,
  });

  if (consumedResult === null) {
    await recordBootstrapOperatorClaimDenied(
      claimContext.organizationId,
      input.userId,
      BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      input.request,
    );
    throw new BootstrapError(
      BOOTSTRAP_ERROR_CODES.alreadyClaimed,
      "bootstrap operator claim is already consumed",
      claimContext.organizationId,
    );
  }

  const { organizationId: claimedOrganizationId, status } = await finalizeBootstrapClaimSuccess(
    input,
    consumedResult.organizationId,
  );

  return {
    instanceId: input.instanceId,
    organizationId: claimedOrganizationId,
    operatorGrantId: input.operatorGrantId,
    ownerMembershipId: input.ownerMembershipId,
    status,
  };
}
