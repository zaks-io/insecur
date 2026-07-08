import {
  secretId,
  type EnvironmentId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { listDraftVersions as listDraftVersionsQuery } from "./list-draft-versions.js";
import {
  resolveDraftPromotionTargetInEnvironment,
  type DraftPromotionTarget,
} from "./resolve-draft-promotion-target.js";
import { resolveSecretForWrite as resolveSecretForWriteRow } from "./resolve-secret-for-write.js";
export { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  parseSecretVersionLifecycleState,
} from "./lifecycle-states.js";
import {
  appendResult,
  assertDeliverableLifecycleState,
  secretVersionRowSelect,
  toSecretVersionStoreRow,
} from "./secret-version-row-mappers.js";
import { publishSecretVersions } from "./publish-secret-versions.js";
import {
  insertDraftVersion,
  insertVersionAndMakeLive,
  lockSecretForAppend,
} from "./secret-version-append.js";
import {
  discardDraftSecretVersion,
  type DiscardDraftSecretVersionResult,
} from "./discard-draft-secret-version.js";
import { getDraftVersionCreator } from "./get-draft-version-creator.js";
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
  SecretVersionCreatorActor,
  SecretVersionStoreRow,
} from "./types.js";

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

  async getVersionInOrganization(
    organizationId: AppendSecretVersionAndMakeLiveInput["organizationId"],
    secretVersionIdValue: SecretVersionId,
  ): Promise<SecretVersionStoreRow | null> {
    const versions = await this.db
      .select(secretVersionRowSelect)
      .from(secretVersions)
      .where(
        and(eq(secretVersions.orgId, organizationId), eq(secretVersions.id, secretVersionIdValue)),
      )
      .limit(1);
    const version = versions[0];
    if (!version) {
      return null;
    }
    return toSecretVersionStoreRow(version, secretId.brand(version.secretId));
  }

  /** @see resolveDraftPromotionTargetInEnvironment (ADR-0017 cross-environment Draft guard). */
  async getDraftPromotionTargetInEnvironment(input: {
    organizationId: OrganizationId;
    environmentId: EnvironmentId;
    secretVersionId: SecretVersionId;
  }): Promise<DraftPromotionTarget | null> {
    return resolveDraftPromotionTargetInEnvironment(this.db, input);
  }

  async getDeliverableVersion(
    secretIdValue: SecretId,
    secretVersionIdValue: SecretVersionId,
  ): Promise<SecretVersionStoreRow | null> {
    const rows = await this.db
      .select(secretVersionRowSelect)
      .from(secretVersions)
      .where(
        and(
          eq(secretVersions.secretId, secretIdValue),
          eq(secretVersions.id, secretVersionIdValue),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    // Check lifecycle state before decoding ciphertext: a discarded version's ciphertext ref is a
    // non-decodable sentinel (ADR-0017), and delivery eligibility should fail with the specific
    // "not deliverable" conflict rather than a generic decode error.
    assertDeliverableLifecycleState(parseSecretVersionLifecycleState(row.lifecycleState));
    return toSecretVersionStoreRow(row, secretIdValue);
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
    return listDraftVersionsQuery(this.db, input);
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
    return appendResult(input, versionNumber, SECRET_VERSION_LIFECYCLE_STATES.draft);
  }

  async appendVersionAndMakeLive(
    input: AppendSecretVersionAndMakeLiveInput,
  ): Promise<AppendSecretVersionAndMakeLiveResult> {
    await lockSecretForAppend(this.db, input.organizationId, input.secretId);
    const versionNumber = await insertVersionAndMakeLive(this.db, input);
    return appendResult(input, versionNumber, SECRET_VERSION_LIFECYCLE_STATES.live);
  }

  async publishVersions(input: PublishSecretVersionsInput): Promise<PublishSecretVersionsResult> {
    return publishSecretVersions(this.db, input);
  }

  async getDraftVersionCreator(input: {
    organizationId: OrganizationId;
    secretId: SecretId;
    secretVersionId: SecretVersionId;
  }): Promise<SecretVersionCreatorActor | null> {
    return getDraftVersionCreator(this.db, input);
  }

  async discardDraftVersion(input: {
    organizationId: OrganizationId;
    secretId: SecretId;
    secretVersionId: SecretVersionId;
  }): Promise<DiscardDraftSecretVersionResult> {
    return discardDraftSecretVersion(this.db, input);
  }
}
