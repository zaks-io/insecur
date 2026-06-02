import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  generateAuditEventId,
  insertAuditEventRow,
  resolveAuditResultCode,
  validateAuditEventInput,
  writeAuditEvent,
} from "@insecur/audit";
import type { UserActor } from "@insecur/auth";
import {
  brandOpaqueResourceIdForPrefix,
  type KnownErrorCode,
  type MembershipId,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

export async function recordBootstrapOperatorClaimDenied(
  organizationId: OrganizationId,
  actor: UserActor,
  reasonCode: KnownErrorCode,
  request?: { requestId: RequestId },
): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied,
    outcome: "denied",
    actor: { type: "user", userId: actor.userId },
    organizationId,
    denial: { reasonCode },
    ...(request !== undefined ? { request } : {}),
  });
}

async function insertValidatedAuditEvent(
  sql: TenantScopedSql,
  event: Parameters<typeof validateAuditEventInput>[0],
): Promise<void> {
  validateAuditEventInput(event);
  const auditEventId = generateAuditEventId();
  const resultCode = resolveAuditResultCode(event);
  await insertAuditEventRow(sql, auditEventId, event, resultCode);
}

export async function recordBootstrapSuccessAuditsInTransaction(
  sql: TenantScopedSql,
  input: {
    organizationId: OrganizationId;
    actor: UserActor;
    ownerMembershipId: MembershipId;
    request?: { requestId: RequestId };
  },
): Promise<void> {
  const actorRef = { type: "user" as const, userId: input.actor.userId };
  const requestRef = input.request !== undefined ? { request: input.request } : {};

  await insertValidatedAuditEvent(sql, {
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapInstanceOperatorGranted,
    outcome: "success",
    actor: actorRef,
    organizationId: input.organizationId,
    resource: {
      type: "organization",
      id: brandOpaqueResourceIdForPrefix("org", input.organizationId),
    },
    ...requestRef,
  });

  await insertValidatedAuditEvent(sql, {
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOwnerMembershipGranted,
    outcome: "success",
    actor: actorRef,
    organizationId: input.organizationId,
    resource: {
      type: "membership",
      id: brandOpaqueResourceIdForPrefix("mem", input.ownerMembershipId),
    },
    ...requestRef,
  });
}
