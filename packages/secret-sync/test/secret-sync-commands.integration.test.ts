import * as audit from "@insecur/audit";
import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  StaticRootKeyProvider,
} from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-keyring";
import {
  appConnectionId,
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  SECRET_SYNC_ERROR_CODES,
  secretId,
  secretSyncId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { TenantAppConnectionStore, closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import {
  assertSecretSyncExecutable,
  createSecretSyncCommand,
  disableSecretSyncCommand,
  listSecretSyncsCommand,
} from "../src/index.js";
import { SecretSyncError } from "../src/secret-sync-error.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { RLS_TEST_ROOT_KEY_BYTES } from "../../tenant-store/test/rls/test-root-key.js";
import {
  TEST_ENV_A_ID,
  TEST_NO_SCOPE_USER_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_SECRET_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);
const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const NO_SCOPE_ACTOR = {
  type: "user" as const,
  userId: userId.brand(TEST_NO_SCOPE_USER_ID),
};
const REQ = requestId.brand("req_00000000000000000000000001");
const CONN_GH = appConnectionId.brand("conn_01JZ8SS12R7M4T0V9X3C5D8F1G");
const SYNC_FIXTURE = secretSyncId.brand("sync_00000000000000000000000476");

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function seedGitHubConnection(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db }) => {
    const store = new TenantAppConnectionStore(db);
    const existing = await store.getConnectionById(ORG_A, CONN_GH);
    if (existing !== null) {
      return;
    }
    await store.createConnection({
      organizationId: ORG_A,
      appConnectionId: CONN_GH,
      provider: "github",
      connectionMethod: "github-app",
      displayName: displayName("GitHub sync fixture"),
      setupUserId: userId.brand(TEST_USER_ID),
      status: "active",
    });
  });
}

describeRls("secret sync model commands", () => {
  const keyring = createTenantBackedKeyring(new StaticRootKeyProvider(RLS_TEST_ROOT_KEY_BYTES));

  beforeAll(async () => {
    await seedTenantBaseline();
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    await seedGitHubConnection();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("creates a github-actions secret sync with exact bindings and audit emission", async () => {
    const writeSpy = vi.spyOn(audit, "writeAuditEvent");

    const created = await createSecretSyncCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      appConnectionId: CONN_GH,
      displayName: displayName("Preview deploy sync"),
      kind: "github-actions",
      bindings: [
        {
          secretId: TEST_SECRET_A_ID,
          providerDestination: "DATABASE_URL",
        },
      ],
      githubTarget: {
        targetRepoId: "repo_00000000000000000000000476",
        githubProviderScope: "repository",
      },
      requestId: REQ,
      keyring,
      secretSyncId: SYNC_FIXTURE,
    });

    expect(created.secretSync.id).toBe(SYNC_FIXTURE);
    expect(created.secretSync.bindings).toHaveLength(1);
    expect(created.secretSync.bindings[0]?.secretId).toBe(secretId.brand(TEST_SECRET_A_ID));
    expect(created.secretSync.bindings[0]?.hasProviderDestination).toBe(true);
    expect(created.secretSync.status).toBe("active");
    expect(writeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: audit.PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreated,
        outcome: "success",
      }),
    );

    const listed = await listSecretSyncsCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
    });
    expect(listed.secretSyncs.some((row) => row.id === SYNC_FIXTURE)).toBe(true);
  });

  it("denies create without sync manage scope", async () => {
    await expect(
      createSecretSyncCommand({
        actor: NO_SCOPE_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        appConnectionId: CONN_GH,
        displayName: displayName("Denied sync"),
        kind: "github-actions",
        bindings: [
          {
            secretId: TEST_SECRET_A_ID,
            providerDestination: "API_KEY",
          },
        ],
        githubTarget: {
          targetRepoId: "repo_00000000000000000000000477",
          githubProviderScope: "repository",
        },
        requestId: REQ,
        keyring,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("rejects pattern-based bindings", async () => {
    await expect(
      createSecretSyncCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        appConnectionId: CONN_GH,
        displayName: displayName("Pattern sync"),
        kind: "github-actions",
        bindings: [
          {
            secretId: "sec_*",
            providerDestination: "DATABASE_URL",
          },
        ],
        githubTarget: {
          targetRepoId: "repo_00000000000000000000000478",
          githubProviderScope: "repository",
        },
        requestId: REQ,
        keyring,
      }),
    ).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.patternBindingRejected,
    });
  });

  it("prevents execution when disabled", async () => {
    const disabled = await disableSecretSyncCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      secretSyncId: SYNC_FIXTURE,
      requestId: REQ,
    });

    expect(disabled.secretSync.status).toBe("disabled");

    await expect(
      assertSecretSyncExecutable({
        organizationId: ORG_A,
        secretSyncId: SYNC_FIXTURE,
      }),
    ).rejects.toMatchObject({
      code: SECRET_SYNC_ERROR_CODES.disabled,
    });
  });

  it("rejects bindings for secrets without a current version in non-protected environments", async () => {
    const missingVersionSecretId = "sec_00000000000000000000000479";
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      await sql`
        INSERT INTO secrets (
          id,
          org_id,
          project_id,
          environment_id,
          variable_key,
          current_version_id
        )
        VALUES (
          ${missingVersionSecretId},
          ${TEST_ORG_A_ID},
          ${TEST_PROJECT_A_ID},
          ${TEST_ENV_A_ID},
          ${"MISSING_VERSION_KEY"},
          NULL
        )
        ON CONFLICT (id) DO NOTHING
      `;
    });

    await expect(
      createSecretSyncCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        appConnectionId: CONN_GH,
        displayName: displayName("Missing version sync"),
        kind: "github-actions",
        bindings: [
          {
            secretId: missingVersionSecretId,
            providerDestination: "MISSING_VERSION_DEST",
          },
        ],
        githubTarget: {
          targetRepoId: "repo_00000000000000000000000479",
          githubProviderScope: "repository",
        },
        requestId: REQ,
        keyring,
      }),
    ).rejects.toBeInstanceOf(SecretSyncError);
  });
});
