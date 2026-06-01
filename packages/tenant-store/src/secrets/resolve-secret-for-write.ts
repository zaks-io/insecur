import { secretId, type SecretId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { SecretVersionStoreConflictError } from "./errors.js";
import type { ResolveSecretForWriteInput } from "./types.js";

interface SecretRow {
  id: string;
  environment_id: string;
  variable_key: string;
}

async function insertSecretRow(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
  secretIdValue: SecretId,
): Promise<void> {
  await sql`
    INSERT INTO secrets (
      id,
      org_id,
      project_id,
      environment_id,
      variable_key,
      current_version_id
    )
    VALUES (
      ${secretIdValue},
      ${input.organizationId},
      ${input.projectId},
      ${input.environmentId},
      ${input.variableKey},
      NULL
    )
  `;
}

async function resolveByExplicitSecretId(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
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
  if (existing) {
    if (
      existing.environment_id !== input.environmentId ||
      existing.variable_key !== input.variableKey
    ) {
      throw new SecretVersionStoreConflictError("secret selector does not match variable key");
    }
    return { secretId: secretId.brand(existing.id), createdSecretShape: false };
  }

  await insertSecretRow(sql, input, explicitId);
  return { secretId: explicitId, createdSecretShape: true };
}

async function resolveByVariableKey(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM secrets
    WHERE environment_id = ${input.environmentId}
      AND variable_key = ${input.variableKey}
    LIMIT 1
  `;
  const match = rows[0];
  if (match) {
    return { secretId: secretId.brand(match.id), createdSecretShape: false };
  }

  const minted = secretId.generate();
  await insertSecretRow(sql, input, minted);
  return { secretId: minted, createdSecretShape: true };
}

export async function resolveSecretForWrite(
  sql: TenantScopedSql,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
  if (input.secretId !== undefined) {
    return resolveByExplicitSecretId(sql, input);
  }
  return resolveByVariableKey(sql, input);
}
