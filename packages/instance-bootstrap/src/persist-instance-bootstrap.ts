import type { DisplayName, OrganizationId, TeamId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { hashBootstrapSecret } from "./bootstrap-secret.js";
import type { BootstrapResourceIds } from "./bootstrap-types.js";

async function insertInstanceShell(
  sql: TenantScopedSql,
  instanceId: string,
  instanceDisplayName: DisplayName,
  workosClientId: string,
): Promise<void> {
  await sql`
    INSERT INTO instances (id, display_name)
    VALUES (${instanceId}, ${instanceDisplayName})
  `;
  await sql`
    INSERT INTO instance_configurations (instance_id) VALUES (${instanceId})
  `;
  await sql`
    INSERT INTO instance_identity_configurations (
      instance_id,
      human_identity_provider,
      workos_client_id
    )
    VALUES (${instanceId}, ${"workos_authkit"}, ${workosClientId})
  `;
}

export async function insertBootstrapInstanceRecords(
  sql: TenantScopedSql,
  input: {
    instanceId: string;
    instanceDisplayName: DisplayName;
    organizationId: OrganizationId;
    organizationDisplayName: DisplayName;
    defaultTeamId: TeamId;
    defaultTeamDisplayName: DisplayName;
    resourceIds: BootstrapResourceIds;
    workosClientId: string;
  },
): Promise<void> {
  await insertInstanceShell(sql, input.instanceId, input.instanceDisplayName, input.workosClientId);
  await sql`
    INSERT INTO organizations (id, instance_id, display_name)
    VALUES (${input.organizationId}, ${input.instanceId}, ${input.organizationDisplayName})
  `;
  await sql`
    INSERT INTO teams (id, org_id, display_name, is_default)
    VALUES (
      ${input.defaultTeamId},
      ${input.organizationId},
      ${input.defaultTeamDisplayName},
      true
    )
  `;
  await sql`
    INSERT INTO bootstrap_operator_claims (
      id,
      instance_id,
      first_organization_id,
      status
    )
    VALUES (
      ${input.resourceIds.claimId},
      ${input.instanceId},
      ${input.organizationId},
      ${"pending"}
    )
  `;
}

export async function insertBootstrapSecretVerifier(
  sql: TenantScopedSql,
  instanceId: string,
  bootstrapSecret: string,
): Promise<void> {
  const verifier = hashBootstrapSecret(bootstrapSecret);
  await sql`
    INSERT INTO bootstrap_secret_verifiers (
      instance_id,
      secret_version,
      algorithm,
      salt_b64,
      hash_b64
    )
    VALUES (
      ${instanceId},
      ${1},
      ${verifier.algorithm},
      ${verifier.saltB64},
      ${verifier.hashB64}
    )
  `;
}
