import { parseVariableKey, secretId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import type {
  ResolveSecretForReadInput,
  ResolvedSecretForRead,
} from "./resolve-secret-for-read-types.js";

function assertExactlyOneSelector(input: ResolveSecretForReadInput): void {
  const hasVariableKey = input.variableKey !== undefined;
  const hasSecretId = input.secretId !== undefined;
  if (hasVariableKey === hasSecretId) {
    throw new Error("exactly one of variableKey or secretId is required");
  }
}

async function resolveByExplicitSecretId(
  db: TenantScopedDb,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  const explicitId = input.secretId;
  if (explicitId === undefined) {
    throw new Error("explicit secret id required");
  }

  const rows = await db
    .select({
      id: secrets.id,
      projectId: secrets.projectId,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
    })
    .from(secrets)
    .where(
      and(
        eq(secrets.id, explicitId),
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        eq(secrets.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) {
    throw new SecretVersionStoreNotFoundError("secret not found");
  }
  if (input.variableKey !== undefined && existing.variableKey !== input.variableKey) {
    throw new SecretVersionStoreConflictError("secret selector does not match variable key");
  }
  const parsedKey = parseVariableKey(existing.variableKey);
  if (!parsedKey.ok) {
    throw new SecretVersionStoreNotFoundError("secret variable key invalid");
  }
  return {
    secretId: secretId.brand(existing.id),
    variableKey: parsedKey.value,
  };
}

async function resolveByVariableKey(
  db: TenantScopedDb,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  const variableKey = input.variableKey;
  if (variableKey === undefined) {
    throw new Error("variable key required");
  }

  const rows = await db
    .select({
      id: secrets.id,
      projectId: secrets.projectId,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
    })
    .from(secrets)
    .where(
      and(
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        eq(secrets.environmentId, input.environmentId),
        eq(secrets.variableKey, variableKey),
      ),
    )
    .limit(1);
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
  db: TenantScopedDb,
  input: ResolveSecretForReadInput,
): Promise<ResolvedSecretForRead> {
  assertExactlyOneSelector(input);
  if (input.secretId !== undefined) {
    return resolveByExplicitSecretId(db, input);
  }
  return resolveByVariableKey(db, input);
}
