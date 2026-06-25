import type { UserActor } from "@insecur/auth";
import {
  BOOTSTRAP_ERROR_CODES,
  organizationId,
  type MembershipId,
  type OrganizationId,
  type RequestId,
  type TeamId,
} from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { applyBootstrapGrantsInTransaction } from "./apply-bootstrap-grants-in-transaction.js";
import { assertOwnerEffectiveAccessInTransaction } from "./assert-owner-effective-access-in-transaction.js";
import {
  recordBootstrapOperatorClaimDeniedInTransaction,
  recordBootstrapSuccessAuditsInTransaction,
} from "./bootstrap-audit.js";
import type { BootstrapStatusComplete } from "./bootstrap-types.js";

export interface ExecuteBootstrapClaimInTransactionInput {
  instanceId: string;
  organizationId: OrganizationId;
  actor: UserActor;
  operatorGrantId: string;
  ownerMembershipId: MembershipId;
  defaultTeamId: TeamId;
  request?: { requestId: RequestId };
}

export interface ExecuteBootstrapClaimInTransactionResult {
  claimId: string;
  organizationId: OrganizationId;
  status: BootstrapStatusComplete;
}

async function recordAlreadyClaimedDenialAndReturnNull(
  sql: TenantScopedSql,
  input: ExecuteBootstrapClaimInTransactionInput,
): Promise<null> {
  await recordBootstrapOperatorClaimDeniedInTransaction(sql, {
    organizationId: input.organizationId,
    actor: input.actor,
    reasonCode: BOOTSTRAP_ERROR_CODES.alreadyClaimed,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return null;
}

export async function executeBootstrapClaimInTransaction(
  sql: TenantScopedSql,
  input: ExecuteBootstrapClaimInTransactionInput,
): Promise<ExecuteBootstrapClaimInTransactionResult | null> {
  const grantUserId = input.actor.userId;

  const consumedClaims = await sql<{ id: string; first_organization_id: string }[]>`
    UPDATE bootstrap_operator_claims
    SET
      status = ${"consumed"},
      consumed_by_user_id = ${grantUserId},
      consumed_at = now()
    WHERE instance_id = ${input.instanceId}
      AND status = ${"pending"}
    RETURNING id, first_organization_id
  `;

  const consumed = consumedClaims[0];
  if (consumed === undefined) {
    return recordAlreadyClaimedDenialAndReturnNull(sql, input);
  }

  const claimedOrganizationId = organizationId.brand(consumed.first_organization_id);

  await applyBootstrapGrantsInTransaction(sql, {
    instanceId: input.instanceId,
    grantUserId,
    operatorGrantId: input.operatorGrantId,
    ownerMembershipId: input.ownerMembershipId,
    organizationId: claimedOrganizationId,
    defaultTeamId: input.defaultTeamId,
  });

  await assertOwnerEffectiveAccessInTransaction(sql, grantUserId, claimedOrganizationId);

  await recordBootstrapSuccessAuditsInTransaction(sql, {
    organizationId: claimedOrganizationId,
    actor: input.actor,
    ownerMembershipId: input.ownerMembershipId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });

  return {
    claimId: consumed.id,
    organizationId: claimedOrganizationId,
    status: {
      phase: "complete",
      instanceId: input.instanceId,
      organizationId: claimedOrganizationId,
      operatorUserId: grantUserId,
    },
  };
}
