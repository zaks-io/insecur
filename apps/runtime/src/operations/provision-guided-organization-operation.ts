import type { UserActor } from "@insecur/auth";
import {
  provisionGuidedOrganization,
  type ProvisionGuidedOrganizationResult,
} from "@insecur/onboarding";
import type { ProvisionGuidedOrganizationRpcInput } from "@insecur/worker-kit";

export interface ProvisionGuidedOrganizationOperationInput {
  readonly actor: UserActor;
  readonly input: ProvisionGuidedOrganizationRpcInput;
}

export async function provisionGuidedOrganizationOperation({
  actor,
  input,
}: ProvisionGuidedOrganizationOperationInput): Promise<ProvisionGuidedOrganizationResult> {
  return provisionGuidedOrganization({
    userId: actor.userId,
    instanceId: input.instanceId,
    // The hop token only mints for an already-admitted, resolved actor.
    isAdmitted: true,
    ...(input.organizationDisplayName !== undefined
      ? { organizationDisplayName: input.organizationDisplayName }
      : {}),
    ...(input.projectDisplayName !== undefined
      ? { projectDisplayName: input.projectDisplayName }
      : {}),
    ...(input.teamDisplayName !== undefined ? { teamDisplayName: input.teamDisplayName } : {}),
    ...(input.environmentDisplayName !== undefined
      ? { environmentDisplayName: input.environmentDisplayName }
      : {}),
    ...(input.resourceIds !== undefined ? { resourceIds: input.resourceIds } : {}),
    request: { requestId: input.requestId },
  });
}
