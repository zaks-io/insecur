import type { UserActor } from "@insecur/auth";
import {
  createOperatorOrganization,
  type CreateOperatorOrganizationResult,
} from "@insecur/onboarding";
import type { CreateOperatorOrganizationRpcInput } from "@insecur/worker-kit";

export interface CreateOperatorOrganizationOperationInput {
  readonly actor: UserActor;
  readonly input: CreateOperatorOrganizationRpcInput;
}

export async function createOperatorOrganizationOperation({
  actor,
  input,
}: CreateOperatorOrganizationOperationInput): Promise<CreateOperatorOrganizationResult> {
  return createOperatorOrganization({
    instanceId: input.instanceId,
    operatorUserId: actor.userId,
    ...(input.organizationDisplayName !== undefined
      ? { organizationDisplayName: input.organizationDisplayName }
      : {}),
    ...(input.teamDisplayName !== undefined ? { teamDisplayName: input.teamDisplayName } : {}),
    ...(input.resourceIds !== undefined ? { resourceIds: input.resourceIds } : {}),
    request: { requestId: input.requestId },
  });
}
