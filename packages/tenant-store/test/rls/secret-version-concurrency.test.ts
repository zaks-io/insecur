import {
  environmentId,
  organizationId,
  parseVariableKey,
  projectId,
  secretId,
  secretVersionId,
  type OrganizationId,
  type SecretId,
  type VariableKey,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TenantSecretVersionStore } from "../../src/secrets/tenant-secret-version-store.js";
import { closeRuntimeSql, withTenantScope } from "../../src/index.js";
import { requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";
import { seedTenantBaseline } from "./seed.js";
import { TEST_ENV_A_ID, TEST_ORG_A_ID, TEST_PROJECT_A_ID } from "./test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeRls = runtimeUrl ? describe : describe.skip;

const CONCURRENT_APPEND_COUNT = 12;

function syntheticWrappedMaterial(suffix: number) {
  return {
    organizationDataKeyVersion: 1,
    projectDataKeyVersion: 1,
    ciphertext: new Uint8Array([suffix, suffix + 1, suffix + 2]),
  };
}

function uniqueConcurrencyVariableKey(): VariableKey {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  const parsed = parseVariableKey(`ARCH05_${suffix}`);
  if (!parsed.ok) {
    throw new Error("test variable key invalid");
  }
  return parsed.value;
}

async function appendVersion(secretIdValue: SecretId, suffix: number) {
  const org = organizationId.brand(TEST_ORG_A_ID);
  const versionId = secretVersionId.generate();
  const wrapped = syntheticWrappedMaterial(suffix);

  return withTenantScope({ kind: "organization", organizationId: org }, async ({ db }) => {
    const store = new TenantSecretVersionStore(db);
    return store.appendVersionAndMakeLive({
      organizationId: org,
      secretId: secretIdValue,
      secretVersionId: versionId,
      wrapped,
      createdSecretShape: false,
    });
  });
}

async function assertConcurrentVersionRows(
  org: OrganizationId,
  dedicatedSecretId: SecretId,
  results: Awaited<ReturnType<typeof appendVersion>>[],
): Promise<void> {
  const versionNumbers = results.map((result) => result.versionNumber).sort((a, b) => a - b);
  expect(versionNumbers).toEqual(
    Array.from({ length: CONCURRENT_APPEND_COUNT }, (_, index) => index + 1),
  );
  expect(new Set(results.map((result) => result.secretVersionId)).size).toBe(
    CONCURRENT_APPEND_COUNT,
  );

  const current = await withTenantScope({ kind: "organization", organizationId: org }, ({ db }) =>
    new TenantSecretVersionStore(db).getCurrentVersion(dedicatedSecretId),
  );
  expect(current).not.toBeNull();
  expect(results.some((result) => result.secretVersionId === current?.secretVersionId)).toBe(true);
  expect(current?.versionNumber).toBe(CONCURRENT_APPEND_COUNT);

  const storedVersions = await withTenantScope(
    { kind: "organization", organizationId: org },
    ({ sql }) =>
      sql<{ id: string; version_number: number; ciphertext_storage_ref: string }[]>`
        SELECT id, version_number, ciphertext_storage_ref
        FROM secret_versions
        WHERE secret_id = ${dedicatedSecretId}
        ORDER BY version_number
      `,
  );
  expect(storedVersions).toHaveLength(CONCURRENT_APPEND_COUNT);
  for (const row of storedVersions) {
    expect(row.ciphertext_storage_ref).toMatch(/^inline:b64:/);
    expect(JSON.stringify(row)).not.toContain("plaintext");
  }

  const currentPointer = await withTenantScope(
    { kind: "organization", organizationId: org },
    ({ sql }) =>
      sql<{ current_version_id: string | null }[]>`
        SELECT current_version_id
        FROM secrets
        WHERE id = ${dedicatedSecretId}
        LIMIT 1
      `,
  );
  expect(currentPointer[0]?.current_version_id).toBe(current?.secretVersionId);
  expect(storedVersions.some((row) => row.id === currentPointer[0]?.current_version_id)).toBe(true);
}

async function assertSerialAppendAfterConcurrency(
  org: OrganizationId,
  dedicatedSecretId: SecretId,
): Promise<void> {
  const serial = await appendVersion(dedicatedSecretId, 200);
  expect(serial.versionNumber).toBe(CONCURRENT_APPEND_COUNT + 1);

  const serialCurrent = await withTenantScope(
    { kind: "organization", organizationId: org },
    ({ db }) => new TenantSecretVersionStore(db).getCurrentVersion(dedicatedSecretId),
  );
  expect(serialCurrent?.secretVersionId).toBe(serial.secretVersionId);
  expect(serialCurrent?.versionNumber).toBe(CONCURRENT_APPEND_COUNT + 1);
}

describeRls("TenantSecretVersionStore append concurrency (real Postgres)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("allocates distinct monotonic versions under concurrent append-and-make-live", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const dedicatedSecretId = secretId.generate();
    const variableKey = uniqueConcurrencyVariableKey();

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ db }) => {
      const store = new TenantSecretVersionStore(db);
      await store.resolveSecretForWrite({
        organizationId: org,
        projectId: projectId.brand(TEST_PROJECT_A_ID),
        environmentId: environmentId.brand(TEST_ENV_A_ID),
        variableKey,
        secretId: dedicatedSecretId,
      });
    });

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_APPEND_COUNT }, (_, index) =>
        appendVersion(dedicatedSecretId, index + 1),
      ),
    );

    await assertConcurrentVersionRows(org, dedicatedSecretId, results);
    await assertSerialAppendAfterConcurrency(org, dedicatedSecretId);
  });
});
