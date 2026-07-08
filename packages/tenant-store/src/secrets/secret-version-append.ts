import type { SecretId, SecretVersionId } from "@insecur/domain";
import { and, eq, max } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { encodeInlineCiphertextStorageRef } from "./ciphertext-storage-ref.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  type SecretVersionLifecycleState,
} from "./lifecycle-states.js";
import type {
  AppendSecretVersionAndMakeLiveInput,
  AppendSecretVersionAsDraftInput,
} from "./types.js";

export async function lockSecretForAppend(
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
    throw new SecretVersionStoreNotFoundError("secret not found for version append");
  }
}

async function allocateNextVersionNumber(
  db: TenantScopedDb,
  secretIdValue: SecretId,
): Promise<number> {
  const [maxRow] = await db
    .select({ maxVersion: max(secretVersions.versionNumber) })
    .from(secretVersions)
    .where(eq(secretVersions.secretId, secretIdValue));

  const versionNumber = (maxRow?.maxVersion ?? 0) + 1;
  if (!Number.isInteger(versionNumber) || versionNumber < 1) {
    throw new Error("failed to allocate secret version number");
  }
  return versionNumber;
}

interface InsertVersionRowInput {
  db: TenantScopedDb;
  appendInput: AppendSecretVersionAndMakeLiveInput;
  storageRef: string;
  versionNumber: number;
  lifecycleState: SecretVersionLifecycleState;
}

async function insertVersionRow(input: InsertVersionRowInput): Promise<void> {
  const { descriptiveVerdicts } = input.appendInput;
  await input.db.insert(secretVersions).values({
    id: input.appendInput.secretVersionId,
    orgId: input.appendInput.organizationId,
    secretId: input.appendInput.secretId,
    versionNumber: input.versionNumber,
    lifecycleState: input.lifecycleState,
    publishedAt: input.lifecycleState === SECRET_VERSION_LIFECYCLE_STATES.live ? new Date() : null,
    organizationDataKeyVersion: input.appendInput.wrapped.organizationDataKeyVersion,
    projectDataKeyVersion: input.appendInput.wrapped.projectDataKeyVersion,
    ciphertextStorageRef: input.storageRef,
    valueByteLength: descriptiveVerdicts.valueByteLength,
    encodingClass: descriptiveVerdicts.encodingClass,
    isEmpty: descriptiveVerdicts.isEmpty,
    hasLeadingOrTrailingWhitespace: descriptiveVerdicts.hasLeadingOrTrailingWhitespace,
    looksLikePlaceholder: descriptiveVerdicts.looksLikePlaceholder,
    secretShapeMatchVerdict: descriptiveVerdicts.secretShapeMatchVerdict,
  });
}

export interface MakeVersionLiveInput {
  db: TenantScopedDb;
  organizationId: AppendSecretVersionAndMakeLiveInput["organizationId"];
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  versionNumber: number;
}

export async function makeVersionLive(input: MakeVersionLiveInput): Promise<void> {
  const updated = await input.db
    .update(secrets)
    .set({
      currentVersionId: input.secretVersionId,
      liveVersionNumber: input.versionNumber,
    })
    .where(
      and(
        eq(secrets.id, input.secretId),
        eq(secrets.orgId, input.organizationId),
        eq(secrets.liveVersionNumber, input.versionNumber - 1),
      ),
    )
    .returning({ id: secrets.id });

  if (!updated[0]) {
    throw new SecretVersionStoreConflictError("secret live version guard rejected publish");
  }
}

export async function retainCurrentLiveVersion(
  db: TenantScopedDb,
  organizationId: AppendSecretVersionAndMakeLiveInput["organizationId"],
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

export async function insertVersionAndMakeLive(
  db: TenantScopedDb,
  input: AppendSecretVersionAndMakeLiveInput,
): Promise<number> {
  const storageRef = encodeInlineCiphertextStorageRef(input.wrapped.ciphertext);
  const versionNumber = await allocateNextVersionNumber(db, input.secretId);

  const [currentSecret] = await db
    .select({ currentVersionId: secrets.currentVersionId })
    .from(secrets)
    .where(and(eq(secrets.id, input.secretId), eq(secrets.orgId, input.organizationId)))
    .limit(1);

  if (currentSecret?.currentVersionId) {
    await retainCurrentLiveVersion(
      db,
      input.organizationId,
      input.secretId,
      currentSecret.currentVersionId,
    );
  }

  await insertVersionRow({
    db,
    appendInput: input,
    storageRef,
    versionNumber,
    lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live,
  });

  await makeVersionLive({
    db,
    organizationId: input.organizationId,
    secretId: input.secretId,
    secretVersionId: input.secretVersionId,
    versionNumber,
  });

  return versionNumber;
}

export async function insertDraftVersion(
  db: TenantScopedDb,
  input: AppendSecretVersionAsDraftInput,
): Promise<number> {
  const storageRef = encodeInlineCiphertextStorageRef(input.wrapped.ciphertext);
  const versionNumber = await allocateNextVersionNumber(db, input.secretId);
  await insertVersionRow({
    db,
    appendInput: input,
    storageRef,
    versionNumber,
    lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft,
  });
  return versionNumber;
}
