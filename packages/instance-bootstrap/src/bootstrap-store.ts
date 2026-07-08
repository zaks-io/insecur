import type { DisplayName, OrganizationId, TeamId } from "@insecur/domain";
import { RECOVERY_CANARY_ORGANIZATION_ID, teamId } from "@insecur/domain";
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
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
    const rows = await sql<InstanceBootstrapRow[]>`
      SELECT
        i.id AS instance_id,
        o.id AS organization_id,
        c.status AS claim_status,
        op.user_id AS operator_user_id
      FROM instances i
      LEFT JOIN organizations o
        ON o.instance_id = i.id
        AND o.id <> ${RECOVERY_CANARY_ORGANIZATION_ID}
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
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
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
  await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await insertBootstrapInstanceRecords(sql, input);
    await insertBootstrapSecretVerifier(sql, input.instanceId, input.bootstrapSecret);
  });
}

export async function loadPendingBootstrapClaim(
  instanceId: string,
): Promise<BootstrapClaimRow | null> {
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
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
  return withTenantScope({ kind: "service" }, async ({ sql }) => {
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

export async function loadDefaultTeamId(organizationId: OrganizationId): Promise<TeamId | null> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
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
