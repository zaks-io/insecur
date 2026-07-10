import { membershipId, ONBOARDING_ERROR_CODES, type KnownErrorCode } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import {
  recordInvitationAcceptDenied,
  recordInvitationAcceptedInTenantScope,
} from "./membership-management-audit.js";
import { MembershipManagementError } from "./membership-management-error.js";
import {
  acceptInvitationInTransaction,
  loadPendingInvitation,
  membershipExistsForGrant,
} from "./invitation-store.js";
import type { AcceptInvitationInput, AcceptInvitationResult } from "./invitation-types.js";
import type { PendingInvitationRow } from "./invitation-store.js";

export type { AcceptInvitationInput, AcceptInvitationResult } from "./invitation-types.js";

async function denyAccept(
  input: AcceptInvitationInput,
  reasonCode: KnownErrorCode,
  message: string,
): Promise<never> {
  await recordInvitationAcceptDenied({
    actorUserId: input.acceptingUserId,
    organizationId: input.organizationId,
    reasonCode,
    invitationId: input.invitationId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  throw new MembershipManagementError(
    reasonCode,
    message,
    input.organizationId,
    input.invitationId,
  );
}

async function assertInvitationInvitee(
  input: AcceptInvitationInput,
  pending: PendingInvitationRow,
): Promise<void> {
  if (pending.inviteeUserId === input.acceptingUserId) {
    return;
  }
  await recordInvitationAcceptDenied({
    actorUserId: input.acceptingUserId,
    organizationId: input.organizationId,
    reasonCode: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
    invitationId: input.invitationId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  throw new MembershipManagementError(
    ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
    "invitation invitee does not match accepting user",
    input.organizationId,
    input.invitationId,
  );
}

async function grantMembershipFromInvitation(
  input: AcceptInvitationInput,
  pending: PendingInvitationRow,
): Promise<ReturnType<typeof membershipId.brand>> {
  if (
    await membershipExistsForGrant({
      organizationId: pending.organizationId,
      userId: input.acceptingUserId,
      projectId: pending.projectId,
    })
  ) {
    return await denyAccept(
      input,
      ONBOARDING_ERROR_CODES.membershipAlreadyExists,
      "membership already exists for invitation scope",
    );
  }

  const grantedMembershipId = input.membershipId ?? membershipId.generate();
  const accepted = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ sql }) => {
      const consumed = await acceptInvitationInTransaction(sql, {
        invitationId: input.invitationId,
        organizationId: input.organizationId,
        acceptingUserId: input.acceptingUserId,
        grantedMembershipId,
      });
      if (consumed === null) {
        return null;
      }
      await recordInvitationAcceptedInTenantScope(sql, {
        actorUserId: input.acceptingUserId,
        organizationId: input.organizationId,
        invitationId: input.invitationId,
        membershipId: grantedMembershipId,
        ...(input.request !== undefined ? { request: input.request } : {}),
      });
      return consumed;
    },
  );

  if (accepted === null) {
    return await denyAccept(
      input,
      ONBOARDING_ERROR_CODES.invitationNotPending,
      "invitation acceptance lost a race or invitation is not pending",
    );
  }

  return grantedMembershipId;
}

/**
 * Accepts a pending Invitation and creates exactly one Membership grant.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const pending = await loadPendingInvitation(input.organizationId, input.invitationId);
  if (pending === null) {
    return await denyAccept(
      input,
      ONBOARDING_ERROR_CODES.invitationNotPending,
      "invitation is not pending",
    );
  }

  await assertInvitationInvitee(input, pending);
  const grantedMembershipId = await grantMembershipFromInvitation(input, pending);

  return {
    invitationId: input.invitationId,
    membershipId: grantedMembershipId,
    organizationId: input.organizationId,
  };
}
