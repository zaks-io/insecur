import type { UserActor } from "@insecur/auth";
import { acceptInvitation, type AcceptInvitationResult } from "@insecur/onboarding";
import type { AcceptInvitationRpcInput } from "@insecur/worker-kit";

export interface AcceptInvitationOperationInput {
  readonly actor: UserActor;
  readonly input: AcceptInvitationRpcInput;
}

export async function acceptInvitationOperation({
  actor,
  input,
}: AcceptInvitationOperationInput): Promise<AcceptInvitationResult> {
  return acceptInvitation({
    invitationId: input.invitationId,
    organizationId: input.organizationId,
    acceptingUserId: actor.userId,
    ...(input.membershipId !== undefined ? { membershipId: input.membershipId } : {}),
    request: { requestId: input.requestId },
  });
}
