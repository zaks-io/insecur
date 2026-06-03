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
import { testDisplayName } from "./test-display-name.js";
import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const PREVIEW_PROTECTED_ID = "env_00000000000000000000000071";

describeIntegration("environment lifecycle write guard", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async (sql) => {
      await sql`DELETE FROM environments WHERE id = ${PREVIEW_PROTECTED_ID}`;
      const store = new TenantEnvironmentLifecycleStore(sql);
      await store.create({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(PREVIEW_PROTECTED_ID),
        displayName: testDisplayName("Protected Preview"),
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
      });
    });
  });

  afterAll(async () => {
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async (sql) => {
      await sql`DELETE FROM environments WHERE id = ${PREVIEW_PROTECTED_ID}`;
    });
    await closeRuntimeSql();
  });

  it("blocks non-protected secret writes against protected environments", async () => {
    await expect(
      writeNonProtectedSecret({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(PREVIEW_PROTECTED_ID),
        variableKey: "BLOCKED_KEY",
        actor: ACTOR,
        valueUtf8: new TextEncoder().encode("value"),
      }),
    ).rejects.toBeInstanceOf(SecretWriteError);

    try {
      await writeNonProtectedSecret({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: environmentId.brand(PREVIEW_PROTECTED_ID),
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
