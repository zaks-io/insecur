import type { OrganizationId, SecretId, SecretVersionId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SecretVersionStoreConflictError, SecretVersionStoreNotFoundError } from "./errors.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";

/** Sentinel storage ref left behind after crypto-erasure; never decodes as ciphertext. */
export const DISCARDED_CIPHERTEXT_STORAGE_REF = "discarded:erased" as const;

export interface DiscardDraftSecretVersionInput {
  readonly organizationId: OrganizationId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
}

export interface DiscardDraftSecretVersionResult {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly alreadyDiscarded: boolean;
}

async function loadDiscardCandidate(db: TenantScopedDb, input: DiscardDraftSecretVersionInput) {
  const [existing] = await db
    .select({
      id: secretVersions.id,
      lifecycleState: secretVersions.lifecycleState,
    })
    .from(secretVersions)
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        eq(secretVersions.secretId, input.secretId),
        eq(secretVersions.id, input.secretVersionId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new SecretVersionStoreNotFoundError("draft secret version not found");
  }
  return existing;
}

/**
 * Draft Version Discard (ADR-0017): terminal, crypto-erasing close of a Draft Version. Ciphertext
 * is overwritten with a non-decodable sentinel so any accidental decode attempt fails loudly;
 * tombstone metadata (byte length, encoding class, discardedAt) is retained for audit. Idempotent
 * for already-discarded targets — a second discard of the same version is a no-op success, not a
 * conflict, matching ADR-0017's API/machine-caller idempotency requirement.
 */
export async function discardDraftSecretVersion(
  db: TenantScopedDb,
  input: DiscardDraftSecretVersionInput,
): Promise<DiscardDraftSecretVersionResult> {
  const existing = await loadDiscardCandidate(db, input);

  if (existing.lifecycleState === SECRET_VERSION_LIFECYCLE_STATES.discarded) {
    return {
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
      alreadyDiscarded: true,
    };
  }

  if (existing.lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.draft) {
    throw new SecretVersionStoreConflictError("only a draft secret version can be discarded");
  }

  const discarded = await db
    .update(secretVersions)
    .set({
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.discarded,
      discardedAt: new Date(),
      ciphertextStorageRef: DISCARDED_CIPHERTEXT_STORAGE_REF,
    })
    .where(
      and(
        eq(secretVersions.orgId, input.organizationId),
        eq(secretVersions.secretId, input.secretId),
        eq(secretVersions.id, input.secretVersionId),
        eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
      ),
    )
    .returning({ id: secretVersions.id });

  if (!discarded[0]) {
    throw new SecretVersionStoreConflictError("only a draft secret version can be discarded");
  }

  return {
    secretId: input.secretId,
    secretVersionId: input.secretVersionId,
    alreadyDiscarded: false,
  };
}
