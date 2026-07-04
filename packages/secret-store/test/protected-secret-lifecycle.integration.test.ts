import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  parseDisplayName,
  projectId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import { decryptSecretValueForRuntime } from "@insecur/crypto";
import {
  SECRET_VERSION_LIFECYCLE_STATES,
  SecretVersionStoreConflictError,
  TenantEnvironmentLifecycleStore,
  TenantSecretVersionStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeNonProtectedSecret } from "../src/write-non-protected-secret.js";
import { writeProtectedSecret } from "../src/write-protected-secret.js";
import { createTestKeyring, testOrganization, uniqueVariableKey } from "./integration-helpers.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG = testOrganization();
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const PROTECTED_ENV_ID = "env_00000000000000000000000081";

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function cleanupProtectedEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`
      UPDATE secrets
      SET current_version_id = NULL
      WHERE environment_id = ${PROTECTED_ENV_ID}
    `;
    await sql`DELETE FROM secret_versions WHERE secret_id IN (
      SELECT id FROM secrets WHERE environment_id = ${PROTECTED_ENV_ID}
    )`;
    await sql`DELETE FROM secrets WHERE environment_id = ${PROTECTED_ENV_ID}`;
    await sql`DELETE FROM environments WHERE id = ${PROTECTED_ENV_ID}`;
  });
}

async function ensureProtectedEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const existing = await store.getById(ORG, environmentId.brand(PROTECTED_ENV_ID));
    if (existing) {
      return;
    }
    await store.create({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: environmentId.brand(PROTECTED_ENV_ID),
      displayName: testDisplayName("Protected Preview"),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
    });
  });
}

describeIntegration("protected secret version lifecycle (INS-55)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupProtectedEnvironment();
    await ensureProtectedEnvironment();
  });

  afterAll(async () => {
    await cleanupProtectedEnvironment();
    await closeRuntimeSql();
  });

  it("creates draft versions without updating live delivery", async () => {
    const variableKey = uniqueVariableKey("PDF09_DRAFT");
    const keyring = createTestKeyring();
    const protectedEnv = environmentId.brand(PROTECTED_ENV_ID);

    const draft = await writeProtectedSecret({
      keyring,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: protectedEnv,
      variableKey,
      actor: ACTOR,
      valueUtf8: new TextEncoder().encode("draft-only-value"),
    });

    expect(draft.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.draft);

    const current = await withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
      new TenantSecretVersionStore(db).getCurrentVersion(draft.secretId),
    );
    expect(current).toBeNull();

    await expect(
      withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
        new TenantSecretVersionStore(db).getDeliverableVersion(
          draft.secretId,
          draft.secretVersionId,
        ),
      ),
    ).rejects.toBeInstanceOf(SecretVersionStoreConflictError);

    const draftRow = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ db }) =>
        new TenantSecretVersionStore(db).getVersionById(draft.secretId, draft.secretVersionId),
    );
    expect(draftRow?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.draft);
  });

  it("publishes exact draft version ids and makes them deliverable", async () => {
    const variableKey = uniqueVariableKey("PDF09_PUBLISH");
    const keyring = createTestKeyring();
    const protectedEnv = environmentId.brand(PROTECTED_ENV_ID);

    const draft = await writeProtectedSecret({
      keyring,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: protectedEnv,
      variableKey,
      actor: ACTOR,
      valueUtf8: new TextEncoder().encode("publish-me"),
    });

    const published = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      async ({ db }) => {
        const store = new TenantSecretVersionStore(db);
        return store.publishVersions({
          organizationId: ORG,
          targets: [{ secretId: draft.secretId, secretVersionId: draft.secretVersionId }],
        });
      },
    );

    expect(published.published).toHaveLength(1);
    expect(published.published[0]?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);

    const current = await withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
      new TenantSecretVersionStore(db).getCurrentVersion(draft.secretId),
    );
    expect(current?.secretVersionId).toBe(draft.secretVersionId);
    if (!current) {
      throw new Error("expected published version to be current");
    }

    const plaintext = await decryptSecretValueForRuntime(
      keyring,
      {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: protectedEnv,
        secretId: draft.secretId,
      },
      current.wrapped,
    );
    expect(new TextDecoder().decode(plaintext.unwrapUtf8())).toBe("publish-me");
    plaintext.dispose();
  });

  it("records protected draft writes with metadata-only audit events", async () => {
    const variableKey = uniqueVariableKey("PDF09_AUDIT");
    const protectedEnv = environmentId.brand(PROTECTED_ENV_ID);

    const draft = await writeProtectedSecret({
      keyring: createTestKeyring(),
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: protectedEnv,
      variableKey,
      actor: ACTOR,
      valueUtf8: new TextEncoder().encode("audit-check"),
    });

    const auditRows = await withTenantScope(
      { kind: "organization", organizationId: ORG },
      ({ sql }) =>
        sql<{ event_code: string; details: unknown }[]>`
        SELECT event_code, details
        FROM audit_events
        WHERE related_resource_id = ${draft.secretVersionId}
        ORDER BY created_at DESC
        LIMIT 1
      `,
    );
    expect(auditRows[0]?.event_code).toBe(PRODUCTION_AUDIT_EVENT_CODES.secretProtectedDraftWrite);
    expect(JSON.stringify(auditRows[0]?.details ?? {})).not.toContain("audit-check");
  });

  it("contrasts non-protected writes that make versions live immediately", async () => {
    const devEnv = environmentId.brand(TEST_ENV_A_ID);
    const variableKey = uniqueVariableKey("PDF09_NONPROTECTED");
    const keyring = createTestKeyring();

    const live = await writeNonProtectedSecret({
      keyring,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: devEnv,
      variableKey,
      actor: ACTOR,
      valueUtf8: new TextEncoder().encode("live-immediately"),
    });

    const current = await withTenantScope({ kind: "organization", organizationId: ORG }, ({ db }) =>
      new TenantSecretVersionStore(db).getCurrentVersion(live.secretId),
    );
    expect(current?.secretVersionId).toBe(live.secretVersionId);
    expect(current?.lifecycleState).toBe(SECRET_VERSION_LIFECYCLE_STATES.live);
  });

  it("rejects protected draft writes on non-protected environments", async () => {
    const devEnv = environmentId.brand(TEST_ENV_A_ID);
    const variableKey = uniqueVariableKey("PDF09_REJECT");

    await expect(
      writeProtectedSecret({
        keyring: createTestKeyring(),
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: devEnv,
        variableKey,
        actor: ACTOR,
        valueUtf8: new TextEncoder().encode("nope"),
      }),
    ).rejects.toMatchObject({
      code: ENVIRONMENT_ERROR_CODES.nonProtectedEnvironment,
    });
  });
});
