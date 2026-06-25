import { secretId, secretVersionId, type SecretId, type SecretVersionId } from "@insecur/domain";
import { and, eq, max } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { decodeStoredWrappedMaterial } from "../decode-stored-wrapped-material.js";
import { encodeInlineCiphertextStorageRef } from "./ciphertext-storage-ref.js";
import { resolveSecretForWrite as resolveSecretForWriteRow } from "./resolve-secret-for-write.js";
import { SecretVersionStoreNotFoundError } from "./errors.js";
export { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAndMakeLiveResult,
  ResolveSecretForWriteInput,
  SecretVersionStoreRow,
} from "./types.js";

const secretVersionRowSelect = {
  id: secretVersions.id,
  orgId: secretVersions.orgId,
  secretId: secretVersions.secretId,
  versionNumber: secretVersions.versionNumber,
  organizationDataKeyVersion: secretVersions.organizationDataKeyVersion,
  projectDataKeyVersion: secretVersions.projectDataKeyVersion,
  ciphertextStorageRef: secretVersions.ciphertextStorageRef,
} as const;

function toSecretVersionStoreRow(
  version: {
    id: string;
    secretId: string;
    versionNumber: number;
    organizationDataKeyVersion: number | null;
    projectDataKeyVersion: number | null;
    ciphertextStorageRef: string;
  },
  secretIdValue: SecretId,
): SecretVersionStoreRow {
  return {
    secretVersionId: secretVersionId.brand(version.id),
    secretId: secretIdValue,
    versionNumber: version.versionNumber,
    organizationDataKeyVersion: version.organizationDataKeyVersion ?? 0,
    projectDataKeyVersion: version.projectDataKeyVersion ?? 0,
    wrapped: decodeStoredWrappedMaterial(version, { material: "secret-version" }),
  };
}

async function lockSecretForAppend(
  db: TenantScopedDb,
  orgId: AppendSecretVersionAndMakeLiveInput["organizationId"],
  secretIdValue: SecretId,
): Promise<void> {
  const locked = await db
    .select({ id: secrets.id })
    .from(secrets)
    .where(and(eq(secrets.id, secretIdValue), eq(secrets.orgId, orgId)))
    .for("update")
    .limit(1);
  if (!locked[0]) {
    throw new SecretVersionStoreNotFoundError("secret not found for append-and-make-live");
  }
}

async function insertVersionAndMakeLive(
  db: TenantScopedDb,
  input: AppendSecretVersionAndMakeLiveInput,
  storageRef: string,
): Promise<number> {
  const [maxRow] = await db
    .select({ maxVersion: max(secretVersions.versionNumber) })
    .from(secretVersions)
    .where(eq(secretVersions.secretId, input.secretId));

  const versionNumber = (maxRow?.maxVersion ?? 0) + 1;

  await db.insert(secretVersions).values({
    id: input.secretVersionId,
    orgId: input.organizationId,
    secretId: input.secretId,
    versionNumber,
    organizationDataKeyVersion: input.wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: input.wrapped.projectDataKeyVersion,
    ciphertextStorageRef: storageRef,
  });

  const updated = await db
    .update(secrets)
    .set({ currentVersionId: input.secretVersionId })
    .where(and(eq(secrets.id, input.secretId), eq(secrets.orgId, input.organizationId)))
    .returning({ id: secrets.id });

  if (!updated[0]) {
    throw new Error("failed to allocate secret version number");
  }

  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new Error("failed to allocate secret version number");
  }

  return versionNumber;
}

/**
 * Postgres-backed Secret Version Store for non-protected append-and-make-live writes.
 * Accepts and returns wrapped material only.
 */
export class TenantSecretVersionStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getVersionById(
    secretIdValue: SecretId,
    secretVersionIdValue: SecretVersionId,
  ): Promise<SecretVersionStoreRow | null> {
    const versions = await this.db
      .select(secretVersionRowSelect)
      .from(secretVersions)
      .where(
        and(
          eq(secretVersions.secretId, secretIdValue),
          eq(secretVersions.id, secretVersionIdValue),
        ),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return null;
    }

    return toSecretVersionStoreRow(version, secretId.brand(version.secretId));
  }

  async getCurrentVersion(secretIdValue: SecretId): Promise<SecretVersionStoreRow | null> {
    const secretRows = await this.db
      .select({
        id: secrets.id,
        orgId: secrets.orgId,
        currentVersionId: secrets.currentVersionId,
      })
      .from(secrets)
      .where(eq(secrets.id, secretIdValue))
      .limit(1);
    const secret = secretRows[0];
    if (!secret?.currentVersionId) {
      return null;
    }

    const versions = await this.db
      .select(secretVersionRowSelect)
      .from(secretVersions)
      .where(
        and(
          eq(secretVersions.orgId, secret.orgId),
          eq(secretVersions.secretId, secret.id),
          eq(secretVersions.id, secret.currentVersionId),
        ),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return null;
    }

    return toSecretVersionStoreRow(version, secretId.brand(secret.id));
  }

  async resolveSecretForWrite(
    input: ResolveSecretForWriteInput,
  ): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
    return resolveSecretForWriteRow(this.db, input);
  }

  async appendVersionAndMakeLive(
    input: AppendSecretVersionAndMakeLiveInput,
  ): Promise<AppendSecretVersionAndMakeLiveResult> {
    const storageRef = encodeInlineCiphertextStorageRef(input.wrapped.ciphertext);
    await lockSecretForAppend(this.db, input.organizationId, input.secretId);
    const versionNumber = await insertVersionAndMakeLive(this.db, input, storageRef);

    return {
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
      versionNumber,
      createdSecretShape: input.createdSecretShape,
    };
  }
}
