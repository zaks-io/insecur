import {
  clearWrappedDefaultTenantDataKeySourceCacheForTests,
  StaticRootKeyProvider,
} from "@insecur/crypto";
import { createTenantBackedKeyring } from "@insecur/tenant-keyring";
import {
  appConnectionId,
  auditEventId,
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  PROTECTED_CHANGE_ERROR_CODES,
  requestId,
  secretSyncId,
  userId,
  type DisplayName,
  type RequestId,
} from "@insecur/domain";
import {
  approveProtectedChange,
  createProtectedChange,
  generateApprovalEvidenceId,
  generateProtectedChangeId,
  recomputeProtectedChangeImpactFingerprint,
  submitProtectedChangeForApproval,
  type ProtectedDeliveryTargetKind,
} from "@insecur/protected-change";
import {
  TenantAppConnectionStore,
  TenantEnvironmentLifecycleStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, expect, it } from "vitest";

import { assertSecretSyncDeliveryApproval, createSecretSyncCommand } from "../src/index.js";
import { describeRls } from "../../tenant-store/test/rls/describe-rls.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import { RLS_TEST_ROOT_KEY_BYTES } from "../../tenant-store/test/rls/test-root-key.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const USER = userId.brand(TEST_USER_ID);
const ACTOR = { type: "user" as const, userId: USER };

const ENV_ENABLE = "env_00000000000000000000000608";
const ENV_RUN = "env_00000000000000000000000609";
const SECRET_ID = "sec_00000000000000000000000608";
const SECRET_VERSION_ID = "sv_00000000000000000000000608";
const CONN_ID = appConnectionId.brand("conn_01JZ8SS12R7M4T0V9X3C5D8608");
const SYNC_ENABLE = secretSyncId.brand("sync_00000000000000000000000608");
const SYNC_OTHER = secretSyncId.brand("sync_00000000000000000000000618");
const SYNC_RUN = secretSyncId.brand("sync_00000000000000000000000628");

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function ensureProtectedEnvironment(rawEnvId: string, name: string): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const envId = environmentId.brand(rawEnvId);
    if ((await store.getById(ORG, envId)) !== null) {
      return;
    }
    // Preview stage without opt-down evidence resolves to a Protected Environment.
    await store.create({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: envId,
      displayName: displayName(name),
      lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
    });
  });
}

async function seedLiveSecret(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    await sql`
      INSERT INTO secrets (id, org_id, project_id, environment_id, variable_key, current_version_id)
      VALUES (${SECRET_ID}, ${ORG}, ${PROJECT}, ${ENV_ENABLE}, ${"PROTECTED_SYNC_TEST_KEY"}, NULL)
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO secret_versions (
        id, org_id, secret_id, version_number,
        organization_data_key_version, project_data_key_version,
        ciphertext_storage_ref, lifecycle_state, value_byte_length, encoding_class,
        is_empty, has_leading_or_trailing_whitespace, looks_like_placeholder,
        secret_shape_match_verdict
      )
      VALUES (
        ${SECRET_VERSION_ID}, ${ORG}, ${SECRET_ID}, ${1}, ${1}, ${1},
        ${"synthetic-ciphertext-ref"}, ${"live"}, ${24}, ${"utf-8"},
        ${false}, ${false}, ${false}, ${"matches"}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      UPDATE secrets SET current_version_id = ${SECRET_VERSION_ID} WHERE id = ${SECRET_ID}
    `;
  });
}

async function seedGitHubConnection(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ db }) => {
    const store = new TenantAppConnectionStore(db);
    if ((await store.getConnectionById(ORG, CONN_ID)) !== null) {
      return;
    }
    await store.createConnection({
      organizationId: ORG,
      appConnectionId: CONN_ID,
      provider: "github",
      connectionMethod: "github-app",
      displayName: displayName("Protected sync fixture connection"),
      setupUserId: USER,
      status: "active",
    });
  });
}

async function cleanupFixtures(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
    for (const envId of [ENV_ENABLE, ENV_RUN]) {
      await sql`DELETE FROM protected_change_approval_evidence WHERE org_id = ${ORG}
        AND protected_change_id IN (SELECT id FROM protected_changes WHERE environment_id = ${envId})`;
      await sql`DELETE FROM protected_changes WHERE org_id = ${ORG} AND environment_id = ${envId}`;
      await sql`DELETE FROM secret_sync_bindings WHERE org_id = ${ORG}
        AND secret_sync_id IN (SELECT id FROM secret_syncs WHERE environment_id = ${envId})`;
      await sql`DELETE FROM secret_syncs WHERE org_id = ${ORG} AND environment_id = ${envId}`;
    }
  });
}

/**
 * Creates, submits, and approves a delivery_config Protected Change for one exact delivery
 * target. The delivery-target fingerprint on the evidence row is computed server-side inside the
 * approval transition; nothing here supplies one.
 */
async function approvedDeliveryChange(input: {
  readonly rawEnvId: string;
  readonly kind: ProtectedDeliveryTargetKind;
  readonly targetId: string;
}): Promise<RequestId> {
  const protectedChangeId = generateProtectedChangeId();
  const envId = environmentId.brand(input.rawEnvId);
  await createProtectedChange({
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: envId,
    protectedChangeId,
    requester: { userId: USER },
    draftVersionIds: [],
    purpose: "delivery_config",
    deliveryTarget: { kind: input.kind, targetId: input.targetId },
    actor: ACTOR,
    auditActor: ACTOR,
    requestId: requestId.generate(),
    isProtectedEnvironment: true,
  });
  const pending = await submitProtectedChangeForApproval({
    organizationId: ORG,
    protectedChangeId,
    actor: ACTOR,
    auditActor: ACTOR,
    requestId: requestId.generate(),
  });
  const fingerprint = await recomputeProtectedChangeImpactFingerprint(pending);
  await approveProtectedChange({
    organizationId: ORG,
    protectedChangeId,
    actor: ACTOR,
    auditActor: ACTOR,
    requestId: requestId.generate(),
    impactReviewFingerprint: fingerprint,
    approvalEvidence: {
      evidenceId: generateApprovalEvidenceId(),
      approverUserId: USER,
      auditEventId: auditEventId.generate(),
      impactReviewFingerprint: fingerprint,
    },
  });
  return protectedChangeId;
}

function createSyncInput(syncId: typeof SYNC_ENABLE, protectedChangeId?: RequestId) {
  return {
    actor: ACTOR,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: environmentId.brand(ENV_ENABLE),
    appConnectionId: CONN_ID,
    displayName: displayName("Protected enable sync"),
    kind: "github-actions",
    bindings: [{ secretId: SECRET_ID, providerDestination: "DATABASE_URL" }],
    githubTarget: {
      targetRepoId: "repo_00000000000000000000000608",
      githubProviderScope: "repository" as const,
    },
    requestId: requestId.generate(),
    keyring: createTenantBackedKeyring(new StaticRootKeyProvider(RLS_TEST_ROOT_KEY_BYTES)),
    secretSyncId: syncId,
    ...(protectedChangeId === undefined ? {} : { protectedChangeId }),
  };
}

describeRls("protected secret sync enable/run approval plumbing (INS-608)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    clearWrappedDefaultTenantDataKeySourceCacheForTests();
    await ensureProtectedEnvironment(ENV_ENABLE, "Protected Sync Enable Env");
    await ensureProtectedEnvironment(ENV_RUN, "Protected Sync Run Env");
    await seedLiveSecret();
    await seedGitHubConnection();
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await closeRuntimeSql();
  });

  it("fails closed with missing_evidence when a protected enable has no protected change reference", async () => {
    await expect(createSecretSyncCommand(createSyncInput(SYNC_ENABLE))).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("fails closed with delivery_target_mismatch when the approval targets a different sync id", async () => {
    const protectedChangeId = await approvedDeliveryChange({
      rawEnvId: ENV_ENABLE,
      kind: "secret_sync_enable",
      targetId: SYNC_OTHER,
    });

    await expect(
      createSecretSyncCommand(createSyncInput(SYNC_ENABLE, protectedChangeId)),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch });

    // Remove the still-active mismatched change so the happy path can hold the single active
    // protected change slot for this environment.
    await withTenantScope({ kind: "organization", organizationId: ORG }, async ({ sql }) => {
      await sql`DELETE FROM protected_change_approval_evidence WHERE org_id = ${ORG} AND protected_change_id = ${protectedChangeId}`;
      await sql`DELETE FROM protected_changes WHERE org_id = ${ORG} AND id = ${protectedChangeId}`;
    });
  });

  it("enables a protected sync end to end with server-recorded approval evidence", async () => {
    const protectedChangeId = await approvedDeliveryChange({
      rawEnvId: ENV_ENABLE,
      kind: "secret_sync_enable",
      targetId: SYNC_ENABLE,
    });

    const created = await createSecretSyncCommand(createSyncInput(SYNC_ENABLE, protectedChangeId));
    expect(created.secretSync.id).toBe(SYNC_ENABLE);
    expect(created.secretSync.status).toBe("active");

    // Single-use evidence (INS-607): the same approval cannot authorize a second enable.
    await expect(
      createSecretSyncCommand(createSyncInput(SYNC_OTHER, protectedChangeId)),
    ).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    });
  });

  it("authorizes a protected sync run through the run gate with recorded evidence", async () => {
    const protectedChangeId = await approvedDeliveryChange({
      rawEnvId: ENV_RUN,
      kind: "secret_sync_run",
      targetId: SYNC_RUN,
    });

    await expect(
      assertSecretSyncDeliveryApproval({
        action: "secret_sync_run",
        sync: {
          id: SYNC_RUN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: environmentId.brand(ENV_RUN),
        },
        actor: ACTOR,
        requestId: requestId.generate(),
        protectedChangeId,
      }),
    ).resolves.toBeUndefined();

    // The consumed run approval cannot authorize a replay.
    await expect(
      assertSecretSyncDeliveryApproval({
        action: "secret_sync_run",
        sync: {
          id: SYNC_RUN,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: environmentId.brand(ENV_RUN),
        },
        actor: ACTOR,
        requestId: requestId.generate(),
        protectedChangeId,
      }),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized });
  });
});
