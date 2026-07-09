import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  secretId,
  secretVersionId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testDescriptiveVerdicts } from "../helpers/descriptive-verdicts.js";
import { TEST_CREATOR_ACTOR } from "../helpers/test-creator-actor.js";
import {
  copyRetainedSecretVersion,
  DISCARDED_CIPHERTEXT_STORAGE_REF,
  ROLLBACK_RETENTION_WINDOW_DAYS,
  SECRET_VERSION_LIFECYCLE_STATES,
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantSecretVersionStore,
  closeRuntimeSql,
  withTenantScope,
} from "../../src/index.js";
import { describeRls } from "./describe-rls.js";
import { seedTenantBaseline } from "./seed.js";
import { TEST_ENV_A_ID, TEST_ORG_A_ID, TEST_PROJECT_A_ID } from "./test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const ENV = environmentId.brand(TEST_ENV_A_ID);

function uniqueVariableKey(prefix: string): VariableKey {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const parsed = parseVariableKey(`${prefix}_${suffix}`);
  if (!parsed.ok) {
    throw new Error("test variable key invalid");
  }
  return parsed.value;
}

function syntheticWrappedMaterial(suffix: number) {
  return {
    organizationDataKeyVersion: 1,
    projectDataKeyVersion: 1,
    ciphertext: new Uint8Array([suffix, suffix + 1, suffix + 2]),
  };
}

async function resolveDedicatedSecret(variableKey: VariableKey): Promise<SecretId> {
  const dedicatedSecretId = secretId.generate();
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
    const store = new TenantSecretVersionStore(db);
    await store.resolveSecretForWrite({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      variableKey,
      secretId: dedicatedSecretId,
    });
  });
  return dedicatedSecretId;
}

describeRls("Draft Version Discard and Rollback Retention Window (real Postgres)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("discards a draft version, erasing ciphertext while retaining tombstone metadata", async () => {
    const variableKey = uniqueVariableKey("DISCARD_DRAFT");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);
    const draftVersionId = secretVersionId.generate();

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAsDraft({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: draftVersionId,
        wrapped: syntheticWrappedMaterial(51),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("discard-draft"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });

    const discardResult = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).discardDraftVersion({
          organizationId: ORG,
          secretId: dedicatedSecretId,
          secretVersionId: draftVersionId,
        }),
    );
    expect(discardResult.alreadyDiscarded).toBe(false);

    const row = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<
          { lifecycle_state: string; ciphertext_storage_ref: string; discarded_at: Date | null }[]
        >`
          SELECT lifecycle_state, ciphertext_storage_ref, discarded_at
          FROM secret_versions
          WHERE id = ${draftVersionId}
          LIMIT 1
        `,
    );
    expect(row[0]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.discarded);
    expect(row[0]?.ciphertext_storage_ref).toBe(DISCARDED_CIPHERTEXT_STORAGE_REF);
    expect(row[0]?.discarded_at).not.toBeNull();

    // Idempotent for a second discard of the same version (ADR-0017).
    const secondDiscard = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).discardDraftVersion({
          organizationId: ORG,
          secretId: dedicatedSecretId,
          secretVersionId: draftVersionId,
        }),
    );
    expect(secondDiscard.alreadyDiscarded).toBe(true);

    // A discarded version can never again be selected for future Promotion/delivery: its
    // ciphertext is overwritten with a non-decodable sentinel, so any attempt to load it for
    // delivery fails loudly rather than silently succeeding.
    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(dedicatedSecretId, draftVersionId),
      ),
    ).rejects.toThrow();
  });

  it("stamps and reads back the creating actor for discard authorization (ADR-0017 §27)", async () => {
    const variableKey = uniqueVariableKey("DISCARD_CREATOR");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);
    const draftVersionId = secretVersionId.generate();

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      await new TenantSecretVersionStore(db).appendVersionAsDraft({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: draftVersionId,
        wrapped: syntheticWrappedMaterial(91),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("discard-creator"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });

    const creator = await withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
      new TenantSecretVersionStore(db).getDraftVersionCreator({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: draftVersionId,
      }),
    );

    expect(creator).toEqual(TEST_CREATOR_ACTOR);
  });

  it("rejects discarding a live version (only drafts are discardable)", async () => {
    const variableKey = uniqueVariableKey("DISCARD_LIVE");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);
    const liveVersionId = secretVersionId.generate();

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: liveVersionId,
        wrapped: syntheticWrappedMaterial(61),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("discard-live"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        new TenantSecretVersionStore(db).discardDraftVersion({
          organizationId: ORG,
          secretId: dedicatedSecretId,
          secretVersionId: liveVersionId,
        }),
      ),
    ).rejects.toBeInstanceOf(SecretVersionStoreConflictError);
  });

  it("rejects discarding a version that does not exist", async () => {
    const variableKey = uniqueVariableKey("DISCARD_MISSING");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        new TenantSecretVersionStore(db).discardDraftVersion({
          organizationId: ORG,
          secretId: dedicatedSecretId,
          secretVersionId: secretVersionId.generate(),
        }),
      ),
    ).rejects.toBeInstanceOf(SecretVersionStoreNotFoundError);
  });

  it("allows Rollback of a retained version inside the Rollback Retention Window", async () => {
    const variableKey = uniqueVariableKey("ROLLBACK_FRESH");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: secretVersionId.generate(),
        wrapped: syntheticWrappedMaterial(71),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("rollback-fresh-1"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });
    const retainedVersionId = secretVersionId.generate();
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: retainedVersionId,
        wrapped: syntheticWrappedMaterial(72),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("rollback-fresh-2"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });
    // Now supersede it so it becomes `retained`, with a fresh publishedAt (default now()).
    const newLiveVersionId = secretVersionId.generate();
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: newLiveVersionId,
        wrapped: syntheticWrappedMaterial(73),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("rollback-fresh-3"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });

    const rollbackDraftId = secretVersionId.generate();
    const copied = await withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
      copyRetainedSecretVersion(db, {
        organizationId: ORG,
        secretId: dedicatedSecretId,
        toSourceVersionId: retainedVersionId,
        newSecretVersionId: rollbackDraftId,
        asDraft: true,
        createdByActor: TEST_CREATOR_ACTOR,
      }),
    );
    expect(copied.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.draft);
  });

  it("rejects Rollback of a retained version outside the Rollback Retention Window (ADR-0076)", async () => {
    const variableKey = uniqueVariableKey("ROLLBACK_EXPIRED");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    const retainedVersionId = secretVersionId.generate();
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: retainedVersionId,
        wrapped: syntheticWrappedMaterial(81),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("rollback-expired-1"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: secretVersionId.generate(),
        wrapped: syntheticWrappedMaterial(82),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("rollback-expired-2"),
        createdByActor: TEST_CREATOR_ACTOR,
      });
    });

    // Lazily evaluated at request time (ADR-0076): backdate publishedAt past the window without
    // any write-time eligibility stamp or background job involved.
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      await sql`
        UPDATE secret_versions
        SET published_at = now() - (${ROLLBACK_RETENTION_WINDOW_DAYS + 1} || ' days')::interval
        WHERE id = ${retainedVersionId}
      `;
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        copyRetainedSecretVersion(db, {
          organizationId: ORG,
          secretId: dedicatedSecretId,
          toSourceVersionId: retainedVersionId,
          newSecretVersionId: secretVersionId.generate(),
          asDraft: true,
          createdByActor: TEST_CREATOR_ACTOR,
        }),
      ),
    ).rejects.toBeInstanceOf(SecretVersionStoreConflictError);
  });
});
