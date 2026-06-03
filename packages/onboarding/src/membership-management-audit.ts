import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordActionAudit,
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

export async function recordOperatorOrganizationDenied(input: {
  operatorUserId: UserId;
  organizationId: OrganizationId;
  reasonCode: KnownErrorCode;
  request?: AuditRequestRef;
}): Promise<void> {
  await recordActionAudit({
    outcome: "denied",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationDenied,
    actor: { type: "user", userId: input.operatorUserId },
    organizationId: input.organizationId,
    reasonCode: input.reasonCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordOperatorOrganizationCreated(input: {
  operatorUserId: UserId;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  request?: AuditRequestRef;
}): Promise<void> {
  await recordActionAudit({
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated,
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
  await recordActionAudit({
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
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
  await recordActionAudit({
    outcome: "denied",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    reasonCode: input.reasonCode,
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
  await recordActionAudit({
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
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
  await recordActionAudit({
    outcome: "denied",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    reasonCode: input.reasonCode,
    ...(input.invitationId !== undefined
      ? {
          resource: {
            type: "invitation",
            id: brandOpaqueResourceIdForPrefix("inv", input.invitationId),
          },
        }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}
