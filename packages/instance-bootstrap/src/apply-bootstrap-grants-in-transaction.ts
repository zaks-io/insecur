import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import type { MembershipId, OrganizationId, TeamId, UserId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";

export interface ApplyBootstrapGrantsInput {
  instanceId: string;
  grantUserId: UserId;
  operatorGrantId: string;
  ownerMembershipId: MembershipId;
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
}

export async function applyBootstrapGrantsInTransaction(
  sql: TenantScopedSql,
  input: ApplyBootstrapGrantsInput,
): Promise<void> {
  await sql`
    UPDATE bootstrap_secret_verifiers
    SET consumed_at = now()
    WHERE instance_id = ${input.instanceId}
      AND consumed_at IS NULL
  `;

  await sql`
    INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
    VALUES (${input.operatorGrantId}, ${input.instanceId}, ${input.grantUserId}, ${"bootstrap"})
  `;

  await sql`
    INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
    VALUES (
      ${input.ownerMembershipId},
      ${input.organizationId},
      ${input.defaultTeamId},
      ${input.grantUserId},
      ${BUILT_IN_ROLE_PRESETS.owner},
      NULL
    )
  `;
}
