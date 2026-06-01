import { FIRST_VALUE_AUDIT_EVENT_CODES, writeAuditEvent } from "@insecur/audit";
import {
  brandOpaqueResourceIdForPrefix,
  type KnownErrorCode,
  type MembershipId,
  type OrganizationId,
  type RequestId,
  type UserId,
} from "@insecur/domain";

export async function recordBootstrapOperatorClaimDenied(
  organizationId: OrganizationId,
  actorUserId: UserId,
  reasonCode: KnownErrorCode,
  request?: { requestId: RequestId },
): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOperatorClaimDenied,
    outcome: "denied",
    actor: { type: "user", userId: actorUserId },
    organizationId,
    denial: { reasonCode },
    ...(request !== undefined ? { request } : {}),
  });
}

export async function recordBootstrapInstanceOperatorGranted(
  organizationId: OrganizationId,
  actorUserId: UserId,
  request?: { requestId: RequestId },
): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapInstanceOperatorGranted,
    outcome: "success",
    actor: { type: "user", userId: actorUserId },
    organizationId,
    resource: {
      type: "organization",
      id: brandOpaqueResourceIdForPrefix("org", organizationId),
    },
    ...(request !== undefined ? { request } : {}),
  });
}

export async function recordBootstrapOwnerMembershipGranted(
  organizationId: OrganizationId,
  actorUserId: UserId,
  ownerMembershipId: MembershipId,
  request?: { requestId: RequestId },
): Promise<void> {
  await writeAuditEvent({
    eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.bootstrapOwnerMembershipGranted,
    outcome: "success",
    actor: { type: "user", userId: actorUserId },
    organizationId,
    resource: {
      type: "membership",
      id: brandOpaqueResourceIdForPrefix("mem", ownerMembershipId),
    },
    ...(request !== undefined ? { request } : {}),
  });
}
