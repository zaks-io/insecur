import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import type { DisplayName, MembershipId, OrganizationId, TeamId, UserId } from "@insecur/domain";
import { organizationId, teamId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import {
  BOOTSTRAP_SECRET_ALGORITHM,
  type BootstrapSecretVerifierMaterial,
  verifyBootstrapSecret,
} from "./bootstrap-secret.js";
import type { BootstrapResourceIds } from "./bootstrap-types.js";
import {
  insertBootstrapInstanceRecords,
  insertBootstrapSecretVerifier,
} from "./persist-instance-bootstrap.js";

interface InstanceBootstrapRow {
  instance_id: string;
  organization_id: string | null;
  claim_status: string | null;
  operator_user_id: string | null;
}

interface BootstrapClaimRow {
  id: string;
  instance_id: string;
  first_organization_id: string;
  status: string;
}

interface BootstrapSecretVerifierRow {
  algorithm: string;
  salt_b64: string;
  hash_b64: string;
  consumed_at: string | null;
}

export async function loadInstanceBootstrapRow(
  instanceId: string,
): Promise<InstanceBootstrapRow | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<InstanceBootstrapRow[]>`
      SELECT
        i.id AS instance_id,
        o.id AS organization_id,
        c.status AS claim_status,
        op.user_id AS operator_user_id
      FROM instances i
      LEFT JOIN organizations o ON o.instance_id = i.id
      LEFT JOIN bootstrap_operator_claims c ON c.instance_id = i.id
      LEFT JOIN instance_operators op
        ON op.instance_id = i.id
        AND op.grant_origin = 'bootstrap'
      WHERE i.id = ${instanceId}
      ORDER BY o.created_at ASC, c.created_at ASC
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

export async function instanceExists(instanceId: string): Promise<boolean> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM instances WHERE id = ${instanceId} LIMIT 1
    `;
    return rows.length > 0;
  });
}

export async function persistInstanceBootstrap(input: {
  instanceId: string;
  instanceDisplayName: DisplayName;
  organizationId: OrganizationId;
  organizationDisplayName: DisplayName;
  defaultTeamId: TeamId;
  defaultTeamDisplayName: DisplayName;
  resourceIds: BootstrapResourceIds;
  bootstrapSecret: string;
  workosClientId: string;
}): Promise<void> {
  await withTenantScope({ kind: "service" }, async (sql) => {
    await insertBootstrapInstanceRecords(sql, input);
    await insertBootstrapSecretVerifier(sql, input.instanceId, input.bootstrapSecret);
  });
}

export async function loadPendingBootstrapClaim(
  instanceId: string,
): Promise<BootstrapClaimRow | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<BootstrapClaimRow[]>`
      SELECT id, instance_id, first_organization_id, status
      FROM bootstrap_operator_claims
      WHERE instance_id = ${instanceId}
        AND status = ${"pending"}
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

export async function loadBootstrapSecretVerifier(
  instanceId: string,
): Promise<BootstrapSecretVerifierRow | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<BootstrapSecretVerifierRow[]>`
      SELECT algorithm, salt_b64, hash_b64, consumed_at
      FROM bootstrap_secret_verifiers
      WHERE instance_id = ${instanceId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

export function isBootstrapSecretValid(secret: string, row: BootstrapSecretVerifierRow): boolean {
  if (row.consumed_at !== null || row.algorithm !== BOOTSTRAP_SECRET_ALGORITHM) {
    return false;
  }

  const material: BootstrapSecretVerifierMaterial = {
    algorithm: BOOTSTRAP_SECRET_ALGORITHM,
    saltB64: row.salt_b64,
    hashB64: row.hash_b64,
  };
  return verifyBootstrapSecret(secret, material);
}

export interface ConsumeBootstrapClaimResult {
  claimId: string;
  organizationId: OrganizationId;
}

export async function consumeBootstrapOperatorClaim(input: {
  instanceId: string;
  userId: UserId;
  operatorGrantId: string;
  ownerMembershipId: MembershipId;
  defaultTeamId: TeamId;
}): Promise<ConsumeBootstrapClaimResult | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const consumedClaims = await sql<{ id: string; first_organization_id: string }[]>`
      UPDATE bootstrap_operator_claims
      SET
        status = ${"consumed"},
        consumed_by_user_id = ${input.userId},
        consumed_at = now()
      WHERE instance_id = ${input.instanceId}
        AND status = ${"pending"}
      RETURNING id, first_organization_id
    `;

    const consumed = consumedClaims[0];
    if (consumed === undefined) {
      return null;
    }

    const claimedOrganizationId = organizationId.brand(consumed.first_organization_id);

    await sql`
      UPDATE bootstrap_secret_verifiers
      SET consumed_at = now()
      WHERE instance_id = ${input.instanceId}
        AND consumed_at IS NULL
    `;

    await sql`
      INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
      VALUES (${input.operatorGrantId}, ${input.instanceId}, ${input.userId}, ${"bootstrap"})
    `;

    await sql`
      INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
      VALUES (
        ${input.ownerMembershipId},
        ${claimedOrganizationId},
        ${input.defaultTeamId},
        ${input.userId},
        ${BUILT_IN_ROLE_PRESETS.owner},
        NULL
      )
    `;

    return {
      claimId: consumed.id,
      organizationId: claimedOrganizationId,
    };
  });
}

export async function loadDefaultTeamId(organizationId: OrganizationId): Promise<TeamId | null> {
  return withTenantScope({ kind: "organization", organizationId }, async (sql) => {
    const rows = await sql<{ id: string }[]>`
        SELECT id
        FROM teams
        WHERE org_id = ${organizationId}
          AND is_default = true
        LIMIT 1
      `;
    const row = rows[0];
    return row === undefined ? null : teamId.brand(row.id);
  });
}
