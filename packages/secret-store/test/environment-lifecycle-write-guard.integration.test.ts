import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { SecretWriteError } from "../src/secret-write-error.js";
import { createTestKeyring } from "./integration-helpers.js";
import { testDisplayName } from "./test-display-name.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
// Dedicated fixture ID: tenant-store lifecycle suites recycle env_...71 concurrently via turbo test:rls.
const WRITE_GUARD_PROTECTED_ENV_ID = "env_00000000000000000000000082";

async function recreateProtectedPreviewEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db, sql }) => {
    await sql`DELETE FROM environments WHERE id = ${WRITE_GUARD_PROTECTED_ENV_ID}`;
    const store = new TenantEnvironmentLifecycleStore(db);
    const created = await store.create({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: environmentId.brand(WRITE_GUARD_PROTECTED_ENV_ID),
      displayName: testDisplayName("Protected Preview"),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
    });
    if (!created.isProtected) {
      throw new Error("write-guard protected preview fixture was not protected at creation");
    }
  });
}

async function cleanupProtectedPreviewEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    await sql`DELETE FROM environments WHERE id = ${WRITE_GUARD_PROTECTED_ENV_ID}`;
  });
}

describeIntegration("environment lifecycle write guard", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await recreateProtectedPreviewEnvironment();
  });

  afterAll(async () => {
    await cleanupProtectedPreviewEnvironment();
    await closeRuntimeSql();
  });

  it("blocks non-protected secret writes against protected environments", async () => {
    await recreateProtectedPreviewEnvironment();

    await expect(
      writeNonProtectedSecret({
        keyring: createTestKeyring(),
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(WRITE_GUARD_PROTECTED_ENV_ID),
        variableKey: "BLOCKED_KEY",
        actor: ACTOR,
        valueUtf8: new TextEncoder().encode("value"),
      }),
    ).rejects.toBeInstanceOf(SecretWriteError);

    try {
      await writeNonProtectedSecret({
        keyring: createTestKeyring(),
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(WRITE_GUARD_PROTECTED_ENV_ID),
        variableKey: "BLOCKED_KEY",
        actor: ACTOR,
        valueUtf8: new TextEncoder().encode("value"),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SecretWriteError);
      expect((error as SecretWriteError).code).toBe(ENVIRONMENT_ERROR_CODES.protectedEnvironment);
    }
  });
});
