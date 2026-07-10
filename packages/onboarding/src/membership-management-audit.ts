import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordActionAudit,
  recordActionAuditInTenantScope,
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
import type { TenantScopedSql } from "@insecur/tenant-store";

interface InvitationSuccessAuditInput {
  actorUserId: UserId;
  organizationId: OrganizationId;
  invitationId: InvitationId;
  request?: AuditRequestRef;
}

function invitationSuccessAuditFields(input: InvitationSuccessAuditInput) {
  return {
    actor: { type: "user" as const, userId: input.actorUserId },
    organizationId: input.organizationId,
    resource: {
      type: "invitation" as const,
      id: brandOpaqueResourceIdForPrefix("inv", input.invitationId),
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  };
}

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

/**
 * Records the operator organization created success audit on the caller's
 * tenant-scoped transaction, so the audit commits atomically with the
 * organization and default team it evidences.
 */
export async function recordOperatorOrganizationCreatedInTenantScope(
  sql: TenantScopedSql,
  input: {
    operatorUserId: UserId;
    organizationId: OrganizationId;
    defaultTeamId: TeamId;
    request?: AuditRequestRef;
  },
): Promise<void> {
  await recordActionAuditInTenantScope(sql, {
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

/**
 * Records the invitation created success audit on the caller's tenant-scoped
 * transaction, so the audit commits atomically with the pending invitation.
 */
export async function recordInvitationCreatedInTenantScope(
  sql: TenantScopedSql,
  input: InvitationSuccessAuditInput,
): Promise<void> {
  await recordActionAuditInTenantScope(sql, {
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
    ...invitationSuccessAuditFields(input),
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

/**
 * Records the invitation accepted success audit on the caller's tenant-scoped
 * transaction, so the audit commits atomically with the membership grant.
 */
export async function recordInvitationAcceptedInTenantScope(
  sql: TenantScopedSql,
  input: InvitationSuccessAuditInput & { membershipId: MembershipId },
): Promise<void> {
  await recordActionAuditInTenantScope(sql, {
    outcome: "success",
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
    ...invitationSuccessAuditFields(input),
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
