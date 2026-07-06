import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  TenantEnvironmentLifecycleStore,
  closeRuntimeSql,
  rethrowEnvironmentLifecycleDbError,
  withTenantScope,
} from "../src/index.js";
import { integrationDatabaseReady } from "./rls/integration-database-ready.js";
import { seedTenantBaseline } from "./rls/seed.js";
import { TEST_ENV_A_ID, TEST_ORG_A_ID, TEST_ORG_B_ID, TEST_PROJECT_A_ID } from "./rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const CONFIRMING_USER = userId.brand("usr_00000000000000000000000001");

const PREVIEW_PROTECTED_ID = "env_00000000000000000000000086";
const PREVIEW_OPT_DOWN_ID = "env_00000000000000000000000087";
const STAGING_ID = "env_00000000000000000000000088";

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function cleanupLifecycleFixtures(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    for (const envId of [PREVIEW_PROTECTED_ID, PREVIEW_OPT_DOWN_ID, STAGING_ID]) {
      await sql`DELETE FROM environments WHERE id = ${envId}`;
    }
  });
}

describeIntegration("environment lifecycle (PDF-04)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupLifecycleFixtures();
  });

  afterAll(async () => {
    await cleanupLifecycleFixtures();
    await closeRuntimeSql();
  });

  it("stores durable lifecycle posture independent of display name", async () => {
    const displayName = testDisplayName("Throwaway Preview Label");
    const created = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantEnvironmentLifecycleStore(db);
        return store.create({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: environmentId.brand(PREVIEW_PROTECTED_ID),
          displayName,
          lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
        });
      },
    );

    expect(created.displayName).toBe(displayName);
    expect(created.lifecycleStage).toBe(ENVIRONMENT_LIFECYCLE_STAGES.preview);
    expect(created.isProtected).toBe(true);
    expect(created.previewNonProductionOptDown).toBeNull();
  });

  it("defaults preview to protected and allows explicit metadata-safe opt-down", async () => {
    const confirmedAt = new Date("2026-06-01T12:00:00.000Z");
    const created = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantEnvironmentLifecycleStore(db);
        return store.create({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: environmentId.brand(PREVIEW_OPT_DOWN_ID),
          displayName: testDisplayName("Preview"),
          lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
          previewNonProductionOptDown: {
            confirmedAt,
            confirmedByUserId: CONFIRMING_USER,
          },
        });
      },
    );

    expect(created.isProtected).toBe(false);
    expect(created.previewNonProductionOptDown).toEqual({
      confirmedAt,
      confirmedByUserId: CONFIRMING_USER,
    });
  });

  it("denies cross-tenant lifecycle reads", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const row = await withTenantScope(
      { kind: "organization", organizationId: orgB },
      async ({ db }) => {
        const store = new TenantEnvironmentLifecycleStore(db);
        return store.getById(orgB, environmentId.brand(TEST_ENV_A_ID));
      },
    );
    expect(row).toBeNull();
  });

  it("updates display name while keeping lifecycle posture immutable", async () => {
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
      const store = new TenantEnvironmentLifecycleStore(db);
      await store.create({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(STAGING_ID),
        displayName: testDisplayName("Staging"),
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.staging,
      });
    });

    const updated = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantEnvironmentLifecycleStore(db);
        return store.updateDisplayName({
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: environmentId.brand(STAGING_ID),
          displayName: testDisplayName("Staging Primary"),
        });
      },
    );

    expect(updated.displayName).toBe("Staging Primary");
    expect(updated.lifecycleStage).toBe(ENVIRONMENT_LIFECYCLE_STAGES.staging);
    expect(updated.isProtected).toBe(true);
  });

  it("rejects lifecycle stage changes after creation", async () => {
    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
        try {
          await sql`
            UPDATE environments
            SET lifecycle_stage = ${ENVIRONMENT_LIFECYCLE_STAGES.development}
            WHERE id = ${STAGING_ID}
          `;
        } catch (error) {
          rethrowEnvironmentLifecycleDbError(error);
        }
      }),
    ).rejects.toMatchObject({
      name: "EnvironmentLifecycleStoreError",
      code: ENVIRONMENT_ERROR_CODES.lifecycleImmutable,
    });
  });
});
