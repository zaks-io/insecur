import type { SecretId } from "@insecur/domain";
import { and, eq, inArray } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";
import { lockSecretForAppend, makeVersionLive } from "./secret-version-append.js";
import type {
  AppendSecretVersionAndMakeLiveResult,
  PublishSecretVersionsInput,
  PublishSecretVersionsResult,
} from "./types.js";

function assertUniquePublishTargets(targets: PublishSecretVersionsInput["targets"]): void {
  const seenSecrets = new Set<SecretId>();
  for (const target of targets) {
    if (seenSecrets.has(target.secretId)) {
      throw new SecretVersionStoreConflictError("publish batch contains duplicate secret");
    }
    seenSecrets.add(target.secretId);
  }
}

async function loadDraftPublishTargets(
  db: TenantScopedDb,
  input: PublishSecretVersionsInput,
): Promise<Map<string, { secretId: string; versionNumber: number; lifecycleState: string }>> {
  const targetVersionIds = input.targets.map((target) => target.secretVersionId);
  const draftRows = await db
    .select({
      id: secretVersions.id,
      secretId: secretVersions.secretId,
      versionNumber: secretVersions.versionNumber,
      lifecycleState: secretVersions.lifecycleState,
    })
    .from(secretVersions)
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        inArray(secretVersions.id, targetVersionIds),
      ),
    );

  if (draftRows.length !== input.targets.length) {
    throw new SecretVersionStoreNotFoundError("publish target secret version not found");
  }

  const draftById = new Map(draftRows.map((row) => [row.id, row]));
  for (const target of input.targets) {
    const row = draftById.get(target.secretVersionId);
    if (row?.secretId !== target.secretId) {
      throw new SecretVersionStoreConflictError("publish target secret version mismatch");
    }
    if (row.lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.draft) {
      throw new SecretVersionStoreConflictError("publish target is not a draft version");
    }
  }

  return draftById;
}

async function retainCurrentLiveVersion(
  db: TenantScopedDb,
  organizationId: PublishSecretVersionsInput["organizationId"],
  secretIdValue: SecretId,
  currentVersionId: string,
): Promise<void> {
  await db
    .update(secretVersions)
    .set({ lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.retained })
    .where(
      and(
        eq(secretVersions.orgId, organizationId),
        eq(secretVersions.secretId, secretIdValue),
        eq(secretVersions.id, currentVersionId),
        eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.live),
      ),
    );
}

interface PromoteDraftToLiveInput {
  db: TenantScopedDb;
  organizationId: PublishSecretVersionsInput["organizationId"];
  secretId: SecretId;
  secretVersionId: string;
  publishedAt: Date;
}

async function promoteDraftToLive(input: PromoteDraftToLiveInput): Promise<void> {
  await input.db
    .update(secretVersions)
    .set({
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live,
      publishedAt: input.publishedAt,
    })
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        eq(secretVersions.secretId, input.secretId),
        eq(secretVersions.id, input.secretVersionId),
        eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
      ),
    );
}

interface PublishSingleTargetInput {
  db: TenantScopedDb;
  publishInput: PublishSecretVersionsInput;
  target: PublishSecretVersionsInput["targets"][number];
  draftById: Map<string, { secretId: string; versionNumber: number; lifecycleState: string }>;
  publishedAt: Date;
}

async function publishSingleTarget(
  input: PublishSingleTargetInput,
): Promise<AppendSecretVersionAndMakeLiveResult> {
  const { db, publishInput, target, draftById, publishedAt } = input;
  const row = draftById.get(target.secretVersionId);
  if (!row) {
    throw new SecretVersionStoreNotFoundError("publish target secret version not found");
  }

  const [currentSecret] = await db
    .select({ currentVersionId: secrets.currentVersionId })
    .from(secrets)
    .where(and(eq(secrets.id, target.secretId), eq(secrets.orgId, publishInput.organizationId)))
    .limit(1);

  if (!currentSecret) {
    throw new SecretVersionStoreNotFoundError("secret not found for publish");
  }

  if (currentSecret.currentVersionId) {
    await retainCurrentLiveVersion(
      db,
      publishInput.organizationId,
      target.secretId,
      currentSecret.currentVersionId,
    );
  }

  await promoteDraftToLive({
    db,
    organizationId: publishInput.organizationId,
    secretId: target.secretId,
    secretVersionId: target.secretVersionId,
    publishedAt,
  });

  await makeVersionLive({
    db,
    organizationId: publishInput.organizationId,
    secretId: target.secretId,
    secretVersionId: target.secretVersionId,
    versionNumber: row.versionNumber,
  });

  return {
    secretId: target.secretId,
    secretVersionId: target.secretVersionId,
    versionNumber: row.versionNumber,
    lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live,
    createdSecretShape: false,
  };
}

export async function publishSecretVersions(
  db: TenantScopedDb,
  input: PublishSecretVersionsInput,
): Promise<PublishSecretVersionsResult> {
  if (input.targets.length === 0) {
    return { published: [] };
  }

  assertUniquePublishTargets(input.targets);

  const uniqueSecretIds = [...new Set(input.targets.map((target) => target.secretId))];
  for (const secretIdValue of uniqueSecretIds) {
    await lockSecretForAppend(db, input.organizationId, secretIdValue);
  }

  const draftById = await loadDraftPublishTargets(db, input);
  const publishedAt = new Date();
  const published: AppendSecretVersionAndMakeLiveResult[] = [];

  for (const target of input.targets) {
    published.push(
      await publishSingleTarget({
        db,
        publishInput: input,
        target,
        draftById,
        publishedAt,
      }),
    );
  }

  return { published };
}
