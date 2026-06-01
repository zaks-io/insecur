import type { OrganizationId } from "@insecur/domain";
import {
  recordBootstrapInstanceOperatorGranted,
  recordBootstrapOwnerMembershipGranted,
} from "./bootstrap-audit.js";
import type {
  BootstrapStatusComplete,
  CompleteBootstrapOperatorClaimInput,
} from "./bootstrap-types.js";
import { assertOwnerEffectiveAccessAfterClaim } from "./assert-owner-effective-access.js";

export async function finalizeBootstrapClaimSuccess(
  input: CompleteBootstrapOperatorClaimInput,
  claimedOrganizationId: OrganizationId,
): Promise<{
  status: BootstrapStatusComplete;
  organizationId: OrganizationId;
}> {
  await assertOwnerEffectiveAccessAfterClaim(input.userId, claimedOrganizationId);

  await recordBootstrapInstanceOperatorGranted(claimedOrganizationId, input.userId, input.request);
  await recordBootstrapOwnerMembershipGranted(
    claimedOrganizationId,
    input.userId,
    input.ownerMembershipId,
    input.request,
  );

  return {
    organizationId: claimedOrganizationId,
    status: {
      phase: "complete",
      instanceId: input.instanceId,
      organizationId: claimedOrganizationId,
      operatorUserId: input.userId,
    },
  };
}
