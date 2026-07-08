import { organizationId, secretId, secretVersionId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  discardDraftSecretVersion,
  DISCARDED_CIPHERTEXT_STORAGE_REF,
} from "../src/secrets/discard-draft-secret-version.js";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
} from "../src/secrets/errors.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "../src/secrets/lifecycle-states.js";
import { createMockTenantDb } from "./helpers/mock-tenant-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");

describe("discardDraftSecretVersion", () => {
  it("transitions a draft version to discarded and erases ciphertext to the sentinel", async () => {
    const { db, updateSets } = createMockTenantDb({
      selectResults: [[{ id: VERSION, lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.draft }]],
      updateReturning: [[{ id: VERSION }]],
    });

    const result = await discardDraftSecretVersion(db, {
      organizationId: ORG,
      secretId: SECRET,
      secretVersionId: VERSION,
    });

    expect(result).toEqual({
      secretId: SECRET,
      secretVersionId: VERSION,
      alreadyDiscarded: false,
    });
    expect(updateSets[0]).toMatchObject({
      lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.discarded,
      ciphertextStorageRef: DISCARDED_CIPHERTEXT_STORAGE_REF,
    });
    expect(updateSets[0]?.discardedAt).toBeInstanceOf(Date);
  });

  it("is idempotent for an already-discarded version (no-op success)", async () => {
    const { db, updateSets } = createMockTenantDb({
      selectResults: [[{ id: VERSION, lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.discarded }]],
    });

    const result = await discardDraftSecretVersion(db, {
      organizationId: ORG,
      secretId: SECRET,
      secretVersionId: VERSION,
    });

    expect(result).toEqual({
      secretId: SECRET,
      secretVersionId: VERSION,
      alreadyDiscarded: true,
    });
    expect(updateSets).toHaveLength(0);
  });

  it("rejects discarding a version that does not exist", async () => {
    const { db } = createMockTenantDb({ selectResults: [[]] });

    await expect(
      discardDraftSecretVersion(db, {
        organizationId: ORG,
        secretId: SECRET,
        secretVersionId: VERSION,
      }),
    ).rejects.toThrow(SecretVersionStoreNotFoundError);
  });

  it("rejects discarding a version that is not a draft (e.g. live)", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ id: VERSION, lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.live }]],
    });

    await expect(
      discardDraftSecretVersion(db, {
        organizationId: ORG,
        secretId: SECRET,
        secretVersionId: VERSION,
      }),
    ).rejects.toThrow(SecretVersionStoreConflictError);
  });

  it("rejects discarding a retained (published) version", async () => {
    const { db } = createMockTenantDb({
      selectResults: [[{ id: VERSION, lifecycleState: SECRET_VERSION_LIFECYCLE_STATES.retained }]],
    });

    await expect(
      discardDraftSecretVersion(db, {
        organizationId: ORG,
        secretId: SECRET,
        secretVersionId: VERSION,
      }),
    ).rejects.toThrow(SecretVersionStoreConflictError);
  });
});
