import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type InvitationId,
  type KnownErrorCode,
  type MembershipId,
  type OrganizationId,
  type TeamId,
  type UserId,
} from "@insecur/domain";

export async function recordOperatorOrganizationCreated(input: {
  operatorUserId: UserId;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  request?: AuditRequestRef;
}): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated,
    outcome: "success",
    actor: { type: "user", userId: input.operatorUserId },
    organizationId: input.organizationId,
    resource: {
      type: "organization",
      id: brandOpaqueResourceIdForPrefix("org", input.organizationId),
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordInvitationCreated(input: {
  actorUserId: UserId;
  organizationId: OrganizationId;
  invitationId: InvitationId;
  request?: AuditRequestRef;
}): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    resource: {
      type: "invitation",
      id: brandOpaqueResourceIdForPrefix("inv", input.invitationId),
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordInvitationCreateDenied(input: {
  actorUserId: UserId;
  organizationId: OrganizationId;
  reasonCode: KnownErrorCode;
  request?: AuditRequestRef;
}): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordInvitationAccepted(input: {
  actorUserId: UserId;
  organizationId: OrganizationId;
  invitationId: InvitationId;
  membershipId: MembershipId;
  request?: AuditRequestRef;
}): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    resource: {
      type: "invitation",
      id: brandOpaqueResourceIdForPrefix("inv", input.invitationId),
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordInvitationAcceptDenied(input: {
  actorUserId: UserId;
  organizationId: OrganizationId;
  reasonCode: KnownErrorCode;
  invitationId?: InvitationId;
  request?: AuditRequestRef;
}): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    denial: { reasonCode: input.reasonCode },
    ...(input.invitationId !== undefined
      ? {
          resource: {
            type: "invitation" as const,
            id: brandOpaqueResourceIdForPrefix("inv", input.invitationId),
          },
        }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}
