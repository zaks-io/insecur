import { secretId, secretVersionId, type SecretId, type SecretVersionId } from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import {
  decodeInlineCiphertextStorageRef,
  encodeInlineCiphertextStorageRef,
} from "./ciphertext-storage-ref.js";
import { resolveSecretForWrite as resolveSecretForWriteRow } from "./resolve-secret-for-write.js";
export { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAndMakeLiveResult,
  ResolveSecretForWriteInput,
  SecretVersionStoreRow,
  StoredWrappedSecretMaterial,
} from "./types.js";

interface SecretRow {
  id: string;
  org_id: string;
  current_version_id: string | null;
}

interface SecretVersionRow {
  id: string;
  org_id: string;
  secret_id: string;
  version_number: number;
  organization_data_key_version: number | null;
  project_data_key_version: number | null;
  ciphertext_storage_ref: string;
}

function toStoredWrappedMaterial(row: SecretVersionRow): StoredWrappedSecretMaterial {
  if (row.organization_data_key_version === null || row.project_data_key_version === null) {
    throw new Error("secret version missing data key version metadata");
  }
  return {
    organizationDataKeyVersion: row.organization_data_key_version,
    projectDataKeyVersion: row.project_data_key_version,
    ciphertext: decodeInlineCiphertextStorageRef(row.ciphertext_storage_ref),
  };
}

/**
 * Postgres-backed Secret Version Store for non-protected append-and-make-live writes.
 * Accepts and returns wrapped material only.
 */
export class TenantSecretVersionStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async getVersionById(
    secretIdValue: SecretId,
    secretVersionIdValue: SecretVersionId,
  ): Promise<SecretVersionStoreRow | null> {
    const versions = await this.sql<SecretVersionRow[]>`
      SELECT
        id,
        org_id,
        secret_id,
        version_number,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref
      FROM secret_versions
      WHERE secret_id = ${secretIdValue}
        AND id = ${secretVersionIdValue}
      LIMIT 1
    `;
    const version = versions[0];
    if (!version) {
      return null;
    }

    return {
      secretVersionId: secretVersionId.brand(version.id),
      secretId: secretId.brand(version.secret_id),
      versionNumber: version.version_number,
      organizationDataKeyVersion: version.organization_data_key_version ?? 0,
      projectDataKeyVersion: version.project_data_key_version ?? 0,
      wrapped: toStoredWrappedMaterial(version),
    };
  }

  async getCurrentVersion(secretIdValue: SecretId): Promise<SecretVersionStoreRow | null> {
    const secrets = await this.sql<SecretRow[]>`
      SELECT id, org_id, current_version_id
      FROM secrets
      WHERE id = ${secretIdValue}
      LIMIT 1
    `;
    const secret = secrets[0];
    if (!secret?.current_version_id) {
      return null;
    }

    const versions = await this.sql<SecretVersionRow[]>`
      SELECT
        id,
        org_id,
        secret_id,
        version_number,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref
      FROM secret_versions
      WHERE org_id = ${secret.org_id}
        AND secret_id = ${secret.id}
        AND id = ${secret.current_version_id}
      LIMIT 1
    `;
    const version = versions[0];
    if (!version) {
      return null;
    }

    return {
      secretVersionId: secretVersionId.brand(version.id),
      secretId: secretId.brand(secret.id),
      versionNumber: version.version_number,
      organizationDataKeyVersion: version.organization_data_key_version ?? 0,
      projectDataKeyVersion: version.project_data_key_version ?? 0,
      wrapped: toStoredWrappedMaterial(version),
    };
  }

  async resolveSecretForWrite(
    input: ResolveSecretForWriteInput,
  ): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
    return resolveSecretForWriteRow(this.sql, input);
  }

  async appendVersionAndMakeLive(
    input: AppendSecretVersionAndMakeLiveInput,
  ): Promise<AppendSecretVersionAndMakeLiveResult> {
    const orgId = input.organizationId;
    const resolvedSecretId = input.secretId;
    const versionNumber = await this.nextVersionNumber(resolvedSecretId);
    const storageRef = encodeInlineCiphertextStorageRef(input.wrapped.ciphertext);

    await this.sql`
      INSERT INTO secret_versions (
        id,
        org_id,
        secret_id,
        version_number,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref
      )
      VALUES (
        ${input.secretVersionId},
        ${orgId},
        ${resolvedSecretId},
        ${versionNumber},
        ${input.wrapped.organizationDataKeyVersion},
        ${input.wrapped.projectDataKeyVersion},
        ${storageRef}
      )
    `;

    await this.sql`
      UPDATE secrets
      SET current_version_id = ${input.secretVersionId}
      WHERE id = ${resolvedSecretId}
        AND org_id = ${orgId}
    `;

    return {
      secretId: resolvedSecretId,
      secretVersionId: input.secretVersionId,
      versionNumber,
      createdSecretShape: input.createdSecretShape,
    };
  }

  private async nextVersionNumber(secretIdValue: SecretId): Promise<number> {
    const rows = await this.sql<{ next_version: number }[]>`
      SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
      FROM secret_versions
      WHERE secret_id = ${secretIdValue}
    `;
    const next = rows[0]?.next_version;
    if (next === undefined || !Number.isInteger(next) || next < 1) {
      throw new Error("failed to allocate secret version number");
    }
    return next;
  }
}
