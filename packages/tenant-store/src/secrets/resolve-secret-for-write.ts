import { secretId, type SecretId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SecretVersionStoreConflictError } from "./errors.js";
import type { ResolveSecretForWriteInput } from "./types.js";

async function insertSecretRow(
  db: TenantScopedDb,
  input: ResolveSecretForWriteInput,
  secretIdValue: SecretId,
): Promise<void> {
  await db.insert(secrets).values({
    id: secretIdValue,
    orgId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    variableKey: input.variableKey,
    currentVersionId: null,
  });
}

async function resolveByExplicitSecretId(
  db: TenantScopedDb,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
  const explicitId = input.secretId;
  if (explicitId === undefined) {
    throw new Error("explicit secret id required");
  }

  const rows = await db
    .select({
      id: secrets.id,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
    })
    .from(secrets)
    .where(and(eq(secrets.id, explicitId), eq(secrets.orgId, input.organizationId)))
    .limit(1);
  const existing = rows[0];
  if (existing) {
    if (
      existing.environmentId !== input.environmentId ||
      existing.variableKey !== input.variableKey
    ) {
      throw new SecretVersionStoreConflictError("secret selector does not match variable key");
    }
    return { secretId: secretId.brand(existing.id), createdSecretShape: false };
  }

  await insertSecretRow(db, input, explicitId);
  return { secretId: explicitId, createdSecretShape: true };
}

async function resolveByVariableKey(
  db: TenantScopedDb,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
  const rows = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(
      and(
        eq(secrets.environmentId, input.environmentId),
        eq(secrets.variableKey, input.variableKey),
      ),
    )
    .limit(1);
  const match = rows[0];
  if (match) {
    return { secretId: secretId.brand(match.id), createdSecretShape: false };
  }

  const minted = secretId.generate();
  await insertSecretRow(db, input, minted);
  return { secretId: minted, createdSecretShape: true };
}

export async function resolveSecretForWrite(
  db: TenantScopedDb,
  input: ResolveSecretForWriteInput,
): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
  if (input.secretId !== undefined) {
    return resolveByExplicitSecretId(db, input);
  }
  return resolveByVariableKey(db, input);
}
