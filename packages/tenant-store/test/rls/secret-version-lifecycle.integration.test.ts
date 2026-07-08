import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  secretId,
  secretVersionId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testDescriptiveVerdicts } from "../helpers/descriptive-verdicts.js";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  SecretVersionStoreConflictError,
  TenantSecretVersionStore,
  closeRuntimeSql,
  withTenantScope,
} from "../../src/index.js";
import { describeRls } from "./describe-rls.js";
import { seedTenantBaseline } from "./seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_SECRET_A_ID,
  TEST_VERSION_A_ID,
} from "./test-ids.js";

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

async function appendLiveVersion(
  secretIdValue: SecretId,
  suffix: number,
): Promise<{ secretVersionId: SecretVersionId; versionNumber: number }> {
  const versionId = secretVersionId.generate();
  const result = await withTenantScope(
    { kind: "organization", organizationId: ORG },
    async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      return store.appendVersionAndMakeLive({
        organizationId: ORG,
        secretId: secretIdValue,
        secretVersionId: versionId,
        wrapped: syntheticWrappedMaterial(suffix),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts(`synthetic-${suffix}`),
      });
    },
  );
  return {
    secretVersionId: result.secretVersionId,
    versionNumber: result.versionNumber,
  };
}

/** Mirrors migration 0012 backfill for superseded secret versions left in draft. */
async function applyMigration0012LifecycleBackfill(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`
      UPDATE secret_versions AS sv
      SET
        lifecycle_state = 'live',
        published_at = COALESCE(sv.published_at, sv.created_at)
      FROM secrets AS s
      WHERE s.current_version_id = sv.id
    `;
    await sql`
      UPDATE secret_versions AS sv
      SET lifecycle_state = 'retained'
      FROM secrets AS s
      WHERE sv.secret_id = s.id
        AND s.current_version_id IS NOT NULL
        AND sv.id <> s.current_version_id
    `;
  });
}

describeRls("TenantSecretVersionStore lifecycle (real Postgres)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("seeds baseline secrets with live_version_number aligned to the live pointer", async () => {
    const rows = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<{ live_version_number: number; current_version_id: string | null }[]>`
        SELECT live_version_number, current_version_id
        FROM secrets
        WHERE id = ${TEST_SECRET_A_ID}
        LIMIT 1
      `,
    );
    expect(rows[0]?.current_version_id).toBe(TEST_VERSION_A_ID);
    expect(rows[0]?.live_version_number).toBe(1);

    const versionRow = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<{ lifecycle_state: string }[]>`
          SELECT lifecycle_state
          FROM secret_versions
          WHERE id = ${TEST_VERSION_A_ID}
          LIMIT 1
        `,
    );
    expect(versionRow[0]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);
  });

  it("retains the prior live version while keeping grant-bound delivery eligible", async () => {
    const variableKey = uniqueVariableKey("LIFE_RETAIN");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    const first = await appendLiveVersion(dedicatedSecretId, 11);
    const second = await appendLiveVersion(dedicatedSecretId, 22);

    expect(second.versionNumber).toBe(first.versionNumber + 1);

    const lifecycleRows = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<{ id: string; lifecycle_state: string }[]>`
          SELECT id, lifecycle_state
          FROM secret_versions
          WHERE secret_id = ${dedicatedSecretId}
          ORDER BY version_number
        `,
    );
    expect(lifecycleRows).toHaveLength(2);
    expect(lifecycleRows[0]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.retained);
    expect(lifecycleRows[1]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);

    const grantBound = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          dedicatedSecretId,
          first.secretVersionId,
        ),
    );
    expect(grantBound?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.retained);

    const currentLive = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          dedicatedSecretId,
          second.secretVersionId,
        ),
    );
    expect(currentLive?.secretVersionId).toBe(second.secretVersionId);
  });

  it("backfills superseded versions to retained and restores grant-bound deliverability", async () => {
    const variableKey = uniqueVariableKey("LIFE_BACKFILL");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    const first = await appendLiveVersion(dedicatedSecretId, 31);
    const second = await appendLiveVersion(dedicatedSecretId, 32);

    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      await sql`
        UPDATE secret_versions
        SET lifecycle_state = 'draft', published_at = NULL
        WHERE id = ${first.secretVersionId}
      `;
      await sql`
        UPDATE secret_versions
        SET lifecycle_state = 'draft', published_at = NULL
        WHERE id = ${second.secretVersionId}
      `;
      await sql`
        UPDATE secrets
        SET current_version_id = ${second.secretVersionId},
            live_version_number = ${second.versionNumber}
        WHERE id = ${dedicatedSecretId}
      `;
      await sql`
        UPDATE secret_versions
        SET lifecycle_state = 'live', published_at = now()
        WHERE id = ${second.secretVersionId}
      `;
    });

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          dedicatedSecretId,
          first.secretVersionId,
        ),
      ),
    ).rejects.toBeInstanceOf(SecretVersionStoreConflictError);

    await applyMigration0012LifecycleBackfill();

    const lifecycleRows = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<{ id: string; lifecycle_state: string }[]>`
          SELECT id, lifecycle_state
          FROM secret_versions
          WHERE secret_id = ${dedicatedSecretId}
          ORDER BY version_number
        `,
    );
    expect(lifecycleRows[0]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.retained);
    expect(lifecycleRows[1]?.lifecycle_state).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);

    const grantBound = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          dedicatedSecretId,
          first.secretVersionId,
        ),
    );
    expect(grantBound?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.retained);

    const grantTarget = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          dedicatedSecretId,
          second.secretVersionId,
        ),
    );
    expect(grantTarget?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);
  });

  it("allows publish when live_version_number matches the current live pointer", async () => {
    const variableKey = uniqueVariableKey("LIFE_PUBLISH_GUARD");
    const dedicatedSecretId = await resolveDedicatedSecret(variableKey);

    await appendLiveVersion(dedicatedSecretId, 41);

    const draftVersionId = secretVersionId.generate();
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.appendVersionAsDraft({
        organizationId: ORG,
        secretId: dedicatedSecretId,
        secretVersionId: draftVersionId,
        wrapped: syntheticWrappedMaterial(42),
        createdSecretShape: false,
        descriptiveVerdicts: testDescriptiveVerdicts("draft-version"),
      });
    });

    const published = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      async ({ db }) => {
        const store = new TenantSecretVersionStore(db);
        return store.publishVersions({
          organizationId: ORG,
          targets: [{ secretId: dedicatedSecretId, secretVersionId: draftVersionId }],
        });
      },
    );
    expect(published.published[0]?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);
    expect(published.published[0]?.versionNumber).toBe(2);
  });
});
