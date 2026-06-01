import { secretId, type SecretId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import type { ResolveSecretForWriteInput } from "./types.js";

interface SecretRow {
  id: string;
  environment_id: string;
  variable_key: string;
}

async function resolveByExplicitSecretId(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<SecretId> {
  const explicitId = input.secretId;
  if (explicitId === undefined) {
    throw new Error("explicit secret id required");
  }

  const rows = await sql<SecretRow[]>`
    SELECT id, environment_id, variable_key
    FROM secrets
    WHERE id = ${explicitId}
      AND org_id = ${input.organizationId}
    LIMIT 1
  `;
  const existing = rows[0];
  if (!existing) {
    throw new SecretVersionStoreNotFoundError("secret not found");
  }
  if (
    existing.environment_id !== input.environmentId ||
    existing.variable_key !== input.variableKey
  ) {
    throw new SecretVersionStoreConflictError("secret selector does not match variable key");
  }
  return secretId.brand(existing.id);
}

async function resolveByVariableKey(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<SecretId> {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM secrets
    WHERE environment_id = ${input.environmentId}
      AND variable_key = ${input.variableKey}
    LIMIT 1
  `;
  const match = rows[0];
  if (!match) {
    throw new SecretVersionStoreNotFoundError("secret not found for variable key");
  }
  return secretId.brand(match.id);
}

/**
 * Resolves an existing Secret Shape by Variable Key or explicit Secret ID for read paths.
 */
export async function resolveSecretForRead(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<SecretId> {
  if (input.secretId !== undefined) {
    return resolveByExplicitSecretId(sql, input);
  }
  return resolveByVariableKey(sql, input);
}
