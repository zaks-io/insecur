import { parseVariableKey, secretId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import type {
  ResolveSecretForReadInput,
  ResolvedSecretForRead,
} from "./resolve-secret-for-read-types.js";

interface SecretRow {
  id: string;
  project_id: string;
  environment_id: string;
  variable_key: string;
}

function assertExactlyOneSelector(input: ResolveSecretForReadInput): void {
  const hasVariableKey = input.variableKey !== undefined;
  const hasSecretId = input.secretId !== undefined;
  if (hasVariableKey === hasSecretId) {
    throw new Error("exactly one of variableKey or secretId is required");
  }
}

async function resolveByExplicitSecretId(
  sql: TenantScopedSql,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  const explicitId = input.secretId;
  if (explicitId === undefined) {
    throw new Error("explicit secret id required");
  }

  const rows = await sql<SecretRow[]>`
    SELECT id, project_id, environment_id, variable_key
    FROM secrets
    WHERE id = ${explicitId}
      AND org_id = ${input.organizationId}
      AND project_id = ${input.projectId}
      AND environment_id = ${input.environmentId}
    LIMIT 1
  `;
  const existing = rows[0];
  if (!existing) {
    throw new SecretVersionStoreNotFoundError("secret not found");
  }
  if (input.variableKey !== undefined && existing.variable_key !== input.variableKey) {
    throw new SecretVersionStoreConflictError("secret selector does not match variable key");
  }
  const parsedKey = parseVariableKey(existing.variable_key);
  if (!parsedKey.ok) {
    throw new SecretVersionStoreNotFoundError("secret variable key invalid");
  }
  return {
    secretId: secretId.brand(existing.id),
    variableKey: parsedKey.value,
  };
}

async function resolveByVariableKey(
  sql: TenantScopedSql,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  const variableKey = input.variableKey;
  if (variableKey === undefined) {
    throw new Error("variable key required");
  }

  const rows = await sql<SecretRow[]>`
    SELECT id, project_id, environment_id, variable_key
    FROM secrets
    WHERE org_id = ${input.organizationId}
      AND project_id = ${input.projectId}
      AND environment_id = ${input.environmentId}
      AND variable_key = ${variableKey}
    LIMIT 1
  `;
  const match = rows[0];
  if (!match) {
    throw new SecretVersionStoreNotFoundError("secret not found for variable key");
  }
  return {
    secretId: secretId.brand(match.id),
    variableKey,
  };
}

/**
 * Resolves an existing Secret Shape by Variable Key or explicit Secret ID for read paths.
 */
export async function resolveSecretForRead(
  sql: TenantScopedSql,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  assertExactlyOneSelector(input);
  if (input.secretId !== undefined) {
    return resolveByExplicitSecretId(sql, input);
  }
  return resolveByVariableKey(sql, input);
}
