import type { InvitationId, KnownErrorCode, OrganizationId } from "@insecur/domain";
import type { CreateInvitationInput } from "./invitation-types.js";
import { recordInvitationCreateDenied } from "./membership-management-audit.js";
import { MembershipManagementError } from "./membership-management-error.js";

export async function denyInvitationCreate(
  input: CreateInvitationInput,
  denial: {
    reasonCode: KnownErrorCode;
    message: string;
    organizationId?: OrganizationId;
    invitationId?: InvitationId;
  },
): Promise<never> {
  await recordInvitationCreateDenied({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    reasonCode: denial.reasonCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  throw new MembershipManagementError(
    denial.reasonCode,
    denial.message,
    denial.organizationId ?? input.organizationId,
    denial.invitationId,
  );
}
