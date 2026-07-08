import {
  secretVersionId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretVersions } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
} from "../secrets/errors.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "../secrets/lifecycle-states.js";
import {
  lockSecretForAppend,
  allocateNextVersionNumber,
} from "../secrets/secret-version-append.js";
import { isWithinRollbackRetentionWindow } from "../secrets/rollback-retention-window.js";
import type { SecretVersionCreatorActor } from "./types.js";

export interface CopyRetainedSecretVersionInput {
  readonly organizationId: OrganizationId;
  readonly secretId: SecretId;
  readonly toSourceVersionId: SecretVersionId;
  readonly newSecretVersionId: SecretVersionId;
  readonly asDraft: boolean;
  /** Actor performing the rollback; becomes the creator of the new copied version (ADR-0017 §27). */
  readonly createdByActor: SecretVersionCreatorActor;
}

export interface CopyRetainedSecretVersionResult {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState:
    typeof SECRET_VERSION_LIFECYCLE_STATES.draft | typeof SECRET_VERSION_LIFECYCLE_STATES.live;
}

async function loadRetainedSourceVersion(
  db: TenantScopedDb,
  organizationId: OrganizationId,
  secretId: SecretId,
  toSourceVersionId: SecretVersionId,
) {
  const [source] = await db
    .select({
      id: secretVersions.id,
      versionNumber: secretVersions.versionNumber,
      lifecycleState: secretVersions.lifecycleState,
      organizationDataKeyVersion: secretVersions.organizationDataKeyVersion,
      projectDataKeyVersion: secretVersions.projectDataKeyVersion,
      ciphertextStorageRef: secretVersions.ciphertextStorageRef,
      valueByteLength: secretVersions.valueByteLength,
      encodingClass: secretVersions.encodingClass,
      isEmpty: secretVersions.isEmpty,
      hasLeadingOrTrailingWhitespace: secretVersions.hasLeadingOrTrailingWhitespace,
      looksLikePlaceholder: secretVersions.looksLikePlaceholder,
      secretShapeMatchVerdict: secretVersions.secretShapeMatchVerdict,
      publishedAt: secretVersions.publishedAt,
    })
    .from(secretVersions)
    .where(
      and(
        eq(secretVersions.orgId, organizationId),
        eq(secretVersions.secretId, secretId),
        eq(secretVersions.id, toSourceVersionId),
      ),
    )
    .limit(1);

  if (!source) {
    throw new SecretVersionStoreNotFoundError("rollback source secret version not found");
  }

  if (source.lifecycleState !== SECRET_VERSION_LIFECYCLE_STATES.retained) {
    throw new SecretVersionStoreConflictError(
      "rollback source is not a retained published version",
    );
  }

  // Lazy Rollback Retention Window check (ADR-0076): evaluated fresh at request time against
  // the source's recorded publishedAt. No write-time eligibility stamp, no background expiry.
  if (!isWithinRollbackRetentionWindow(source.publishedAt)) {
    throw new SecretVersionStoreConflictError(
      "rollback source is outside the rollback retention window",
    );
  }

  return source;
}

/**
 * Rollback seam: copy ciphertext from a retained Published Version without decrypting (ADR-0017).
 */
export async function copyRetainedSecretVersion(
  db: TenantScopedDb,
  input: CopyRetainedSecretVersionInput,
): Promise<CopyRetainedSecretVersionResult> {
  await lockSecretForAppend(db, input.organizationId, input.secretId);

  const source = await loadRetainedSourceVersion(
    db,
    input.organizationId,
    input.secretId,
    input.toSourceVersionId,
  );

  const versionNumber = await allocateNextVersionNumber(db, input.secretId);
  const lifecycleState = input.asDraft
    ? SECRET_VERSION_LIFECYCLE_STATES.draft
    : SECRET_VERSION_LIFECYCLE_STATES.live;

  await db.insert(secretVersions).values({
    id: input.newSecretVersionId,
    orgId: input.organizationId,
    secretId: input.secretId,
    versionNumber,
    lifecycleState,
    createdByActorType: input.createdByActor.type,
    createdByUserId: input.createdByActor.type === "user" ? input.createdByActor.userId : null,
    createdByMachineIdentityId:
      input.createdByActor.type === "machine" ? input.createdByActor.machineIdentityId : null,
    publishedAt: lifecycleState === SECRET_VERSION_LIFECYCLE_STATES.live ? new Date() : null,
    organizationDataKeyVersion: source.organizationDataKeyVersion,
    projectDataKeyVersion: source.projectDataKeyVersion,
    ciphertextStorageRef: source.ciphertextStorageRef,
    valueByteLength: source.valueByteLength,
    encodingClass: source.encodingClass,
    isEmpty: source.isEmpty,
    hasLeadingOrTrailingWhitespace: source.hasLeadingOrTrailingWhitespace,
    looksLikePlaceholder: source.looksLikePlaceholder,
    secretShapeMatchVerdict: source.secretShapeMatchVerdict,
  });

  return {
    secretId: input.secretId,
    secretVersionId: secretVersionId.brand(input.newSecretVersionId),
    versionNumber,
    lifecycleState,
  };
}
