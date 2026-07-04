import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import type { OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "./deploy-key-secret.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "./environment-deploy-key-auth-method-row.js";
import { parseCredentialScopeRows } from "./parse-credential-scope-rows.js";

interface EnvironmentDeployKeyDbRow {
  id: string;
  org_id: string;
  machine_identity_id: string;
  project_id: string;
  environment_id: string;
  runtime_policy_key_ids: string[];
  credential_scopes: string[];
  secret_hash_algorithm: string;
  secret_hash_salt_b64: string;
  secret_hash_b64: string;
  status: string;
  expires_at: Date | null;
  non_expiring: boolean;
  rotation_interval_seconds: number | null;
  rotation_reminder_interval_seconds: number | null;
  created_at: Date;
}

function parseRuntimePolicyKeyIds(
  ids: string[],
): readonly ReturnType<typeof runtimePolicyId.brand>[] | null {
  const parsed = [];
  for (const id of ids) {
    const branded = runtimePolicyId.parse(id);
    if (!branded.ok) {
      return null;
    }
    parsed.push(branded.value);
  }
  return parsed.length > 0 ? parsed : null;
}

function toAuthMethodRow(row: EnvironmentDeployKeyDbRow): EnvironmentDeployKeyAuthMethodRow | null {
  if (row.secret_hash_algorithm !== DEPLOY_KEY_SECRET_ALGORITHM) {
    return null;
  }
  if (row.status !== "active" && row.status !== "disabled") {
    return null;
  }

  const credentialScopes = parseCredentialScopeRows(row.credential_scopes);
  if (credentialScopes === null) {
    return null;
  }

  const runtimePolicyKeyIds = parseRuntimePolicyKeyIds(row.runtime_policy_key_ids);
  if (runtimePolicyKeyIds === null) {
    return null;
  }

  return {
    id: machineAuthMethodId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    machineIdentityId: machineIdentityId.brand(row.machine_identity_id),
    projectId: projectId.brand(row.project_id),
    environmentId: environmentId.brand(row.environment_id),
    runtimePolicyKeyIds,
    credentialScopes,
    secretVerifier: {
      algorithm: DEPLOY_KEY_SECRET_ALGORITHM,
      saltB64: row.secret_hash_salt_b64,
      hashB64: row.secret_hash_b64,
    },
    status: row.status,
    expiresAt: row.expires_at,
    nonExpiring: row.non_expiring,
    rotationIntervalSeconds: row.rotation_interval_seconds,
    rotationReminderIntervalSeconds: row.rotation_reminder_interval_seconds,
    createdAt: row.created_at,
  };
}

/**
 * Loads Environment Deploy Key auth methods for an Organization inside tenant scope.
 */
export async function loadActiveEnvironmentDeployKeyAuthMethods(
  sql: TenantScopedSql,
  orgId: OrganizationId,
): Promise<readonly EnvironmentDeployKeyAuthMethodRow[]> {
  const rows = await sql<EnvironmentDeployKeyDbRow[]>`
    SELECT
      method.id,
      method.org_id,
      method.machine_identity_id,
      method.project_id,
      method.environment_id,
      method.runtime_policy_key_ids,
      method.credential_scopes,
      method.secret_hash_algorithm,
      method.secret_hash_salt_b64,
      method.secret_hash_b64,
      method.status,
      method.expires_at,
      method.non_expiring,
      method.rotation_interval_seconds,
      method.rotation_reminder_interval_seconds,
      method.created_at
    FROM machine_identity_environment_deploy_keys AS method
    INNER JOIN machine_identities AS identity
      ON identity.org_id = method.org_id
      AND identity.id = method.machine_identity_id
    WHERE method.org_id = ${orgId}
      AND identity.status = 'active'
  `;

  const authMethods: EnvironmentDeployKeyAuthMethodRow[] = [];
  for (const row of rows) {
    const parsed = toAuthMethodRow(row);
    if (parsed !== null) {
      authMethods.push(parsed);
    }
  }
  return authMethods;
}
