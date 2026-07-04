import { secretId, secretVersionId, type SecretId, type SecretVersionId } from "@insecur/domain";
import { and, asc, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { decodeStoredWrappedMaterial } from "../decode-stored-wrapped-material.js";
import { resolveSecretForWrite as resolveSecretForWriteRow } from "./resolve-secret-for-write.js";
import { SecretVersionStoreConflictError } from "./errors.js";
export { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  parseSecretVersionLifecycleState,
  type SecretVersionLifecycleState,
} from "./lifecycle-states.js";
import { publishSecretVersions } from "./publish-secret-versions.js";
import {
  insertDraftVersion,
  insertVersionAndMakeLive,
  lockSecretForAppend,
} from "./secret-version-append.js";
import type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAndMakeLiveResult,
  AppendSecretVersionAsDraftInput,
  AppendSecretVersionAsDraftResult,
  DraftVersionMetadataRow,
  ListDraftVersionsInput,
  PublishSecretVersionsInput,
  PublishSecretVersionsResult,
  ResolveSecretForWriteInput,
  SecretVersionStoreRow,
} from "./types.js";

const secretVersionRowSelect = {
  id: secretVersions.id,
  orgId: secretVersions.orgId,
  secretId: secretVersions.secretId,
  versionNumber: secretVersions.versionNumber,
  lifecycleState: secretVersions.lifecycleState,
  organizationDataKeyVersion: secretVersions.organizationDataKeyVersion,
  projectDataKeyVersion: secretVersions.projectDataKeyVersion,
  ciphertextStorageRef: secretVersions.ciphertextStorageRef,
} as const;

function toSecretVersionStoreRow(
  version: {
    id: string;
    secretId: string;
    versionNumber: number;
    lifecycleState: string;
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
    lifecycleState: parseSecretVersionLifecycleState(version.lifecycleState),
    organizationDataKeyVersion: version.organizationDataKeyVersion ?? 0,
    projectDataKeyVersion: version.projectDataKeyVersion ?? 0,
    wrapped: decodeStoredWrappedMaterial(version, { material: "secret-version" }),
  };
}

function assertDeliverableLifecycleState(lifecycleState: SecretVersionLifecycleState): void {
  if (lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.live) {
    throw new SecretVersionStoreConflictError("secret version is not deliverable");
  }
}

/**
 * Postgres-backed Secret Version Store. Accepts and returns wrapped material only.
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

  async getDeliverableVersion(
    secretIdValue: SecretId,
    secretVersionIdValue: SecretVersionId,
  ): Promise<SecretVersionStoreRow | null> {
    const version = await this.getVersionById(secretIdValue, secretVersionIdValue);
    if (!version) {
      return null;
    }
    assertDeliverableLifecycleState(version.lifecycleState);
    return version;
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
          eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.live),
        ),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return null;
    }

    return toSecretVersionStoreRow(version, secretId.brand(secret.id));
  }

  async listDraftVersions(input: ListDraftVersionsInput): Promise<DraftVersionMetadataRow[]> {
    const conditions = [
      eq(secrets.orgId, input.organizationId),
      eq(secrets.environmentId, input.environmentId),
      eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
    ];
    if (input.secretId !== undefined) {
      conditions.push(eq(secrets.id, input.secretId));
    }

    const rows = await this.db
      .select({
        secretId: secrets.id,
        secretVersionId: secretVersions.id,
        versionNumber: secretVersions.versionNumber,
        variableKey: secrets.variableKey,
      })
      .from(secretVersions)
      .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
      .where(and(...conditions))
      .orderBy(asc(secretVersions.createdAt));

    return rows.map((row) => ({
      secretId: secretId.brand(row.secretId),
      secretVersionId: secretVersionId.brand(row.secretVersionId),
      versionNumber: row.versionNumber,
      variableKey: row.variableKey as DraftVersionMetadataRow["variableKey"],
    }));
  }

  async resolveSecretForWrite(
    input: ResolveSecretForWriteInput,
  ): Promise<{ secretId: SecretId; createdSecretShape: boolean }> {
    return resolveSecretForWriteRow(this.db, input);
  }

  async appendVersionAsDraft(
    input: AppendSecretVersionAsDraftInput,
  ): Promise<AppendSecretVersionAsDraftResult> {
    await lockSecretForAppend(this.db, input.organizationId, input.secretId);
    const versionNumber = await insertDraftVersion(this.db, input);

    return {
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
      versionNumber,
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft,
      createdSecretShape: input.createdSecretShape,
    };
  }

  async appendVersionAndMakeLive(
    input: AppendSecretVersionAndMakeLiveInput,
  ): Promise<AppendSecretVersionAndMakeLiveResult> {
    await lockSecretForAppend(this.db, input.organizationId, input.secretId);
    const versionNumber = await insertVersionAndMakeLive(this.db, input);

    return {
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
      versionNumber,
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live,
      createdSecretShape: input.createdSecretShape,
    };
  }

  async publishVersions(input: PublishSecretVersionsInput): Promise<PublishSecretVersionsResult> {
    return publishSecretVersions(this.db, input);
  }
}
