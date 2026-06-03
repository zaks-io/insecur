import {
  AUTH_ERROR_CODES,
  invitationId,
  ONBOARDING_ERROR_CODES,
  type InvitationId,
  type KnownErrorCode,
  type OrganizationId,
} from "@insecur/domain";
import { isUniqueConstraintViolation } from "@insecur/tenant-store";
import {
  assertInvitationProjectCoordinate,
  assertInvitationRolePreset,
} from "./assert-invitation-create-input.js";
import { assertMembershipManageScope } from "./assert-membership-manage-scope.js";
import { auditAccessDenialOnFailure, type BuiltInRolePreset } from "@insecur/access";
import {
  recordInvitationCreateDenied,
  recordInvitationCreated,
} from "./membership-management-audit.js";
import { MembershipManagementError } from "./membership-management-error.js";
import {
  insertPendingInvitation,
  loadDefaultTeamId,
  membershipExistsForGrant,
} from "./invitation-store.js";
import type { CreateInvitationInput, CreateInvitationResult } from "./invitation-types.js";

export type { CreateInvitationInput, CreateInvitationResult } from "./invitation-types.js";

async function denyInvitationCreate(
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
    denial.organizationId,
    denial.invitationId,
  );
}

async function assertCanCreateInvitation(input: CreateInvitationInput): Promise<void> {
  try {
    await assertMembershipManageScope(input.actor, input.organizationId, input.projectId);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: (candidate): candidate is MembershipManagementError =>
        candidate instanceof MembershipManagementError &&
        candidate.code === AUTH_ERROR_CODES.insufficientScope,
      recordDenied: () =>
        recordInvitationCreateDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
          ...(input.request !== undefined ? { request: input.request } : {}),
        }),
    });
    throw error;
  }
}

async function assertInviteeHasNoMembership(input: CreateInvitationInput): Promise<void> {
  const projectScope = input.projectId ?? null;
  if (
    await membershipExistsForGrant({
      organizationId: input.organizationId,
      userId: input.inviteeUserId,
      projectId: projectScope,
    })
  ) {
    await denyInvitationCreate(input, {
      reasonCode: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
      message: "invitee already has a membership for this scope",
      organizationId: input.organizationId,
    });
  }
}

/**
 * Creates a pending Invitation for exactly one organization- or project-scoped Membership grant.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  await assertInvitationRolePreset(input);
  await assertInvitationProjectCoordinate(input);
  await assertCanCreateInvitation(input);
  await assertInviteeHasNoMembership(input);

  const rolePreset = input.rolePreset as BuiltInRolePreset;
  const projectScope = input.projectId ?? null;
  const invId = input.invitationId ?? invitationId.generate();
  const defaultTeamId = await loadDefaultTeamId(input.organizationId);

  try {
    await insertPendingInvitation({
      invitationId: invId,
      organizationId: input.organizationId,
      teamId: defaultTeamId,
      inviteeUserId: input.inviteeUserId,
      rolePreset,
      projectId: projectScope,
    });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    await denyInvitationCreate(input, {
      reasonCode: ONBOARDING_ERROR_CODES.resourceConflict,
      message: "invitation resource id conflict",
      organizationId: input.organizationId,
      invitationId: invId,
    });
  }

  await recordInvitationCreated({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    invitationId: invId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });

  return {
    invitationId: invId,
    organizationId: input.organizationId,
    teamId: defaultTeamId,
    inviteeUserId: input.inviteeUserId,
    rolePreset,
    projectId: projectScope,
  };
}
