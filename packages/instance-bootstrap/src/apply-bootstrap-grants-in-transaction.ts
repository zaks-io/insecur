import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import {
  userAdmissionId,
  type MembershipId,
  type OrganizationId,
  type TeamId,
  type UserId,
} from "@insecur/domain";
import {
  insertActiveUserAdmissionInTransaction,
  type TenantScopedSql,
} from "@insecur/tenant-store";

export interface ApplyBootstrapGrantsInput {
  instanceId: string;
  grantUserId: UserId;
  grantWorkosUserId: string;
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

  // Login resolves actors solely through active user_admissions rows (INS-180), so the claim must
  // admit the granted human atomically with the grants or the operator can never sign in (INS-419).
  // A pre-existing admission for this WorkOS subject violates the unique key and rolls back the
  // whole claim; the first-operator ceremony only runs against a freshly bootstrapped instance.
  await insertActiveUserAdmissionInTransaction(sql, {
    admissionId: userAdmissionId.generate(),
    instanceId: input.instanceId,
    userId: input.grantUserId,
    workosUserId: input.grantWorkosUserId,
  });

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
