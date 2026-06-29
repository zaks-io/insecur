import type { UserActor } from "@insecur/auth";
import { createInvitation, type CreateInvitationResult } from "@insecur/onboarding";
import type { CreateInvitationRpcInput } from "@insecur/worker-kit";

export interface CreateInvitationOperationInput {
  readonly actor: UserActor;
  readonly input: CreateInvitationRpcInput;
}

export async function createInvitationOperation({
  actor,
  input,
}: CreateInvitationOperationInput): Promise<CreateInvitationResult> {
  return createInvitation({
    actor: { type: "user", userId: actor.userId },
    organizationId: input.organizationId,
    inviteeUserId: input.inviteeUserId,
    rolePreset: input.rolePreset,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.invitationId !== undefined ? { invitationId: input.invitationId } : {}),
    ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
    request: { requestId: input.requestId },
  });
}
