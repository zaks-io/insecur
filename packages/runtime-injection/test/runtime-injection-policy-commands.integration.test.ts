import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  RUNTIME_POLICY_ERROR_CODES,
  runtimePolicyId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { HighAssuranceHandoffError } from "@insecur/high-assurance";
import {
  TenantEnvironmentLifecycleStore,
  TenantRuntimeInjectionPolicyStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";

import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_SECRET_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { createRuntimeInjectionPolicyCommand } from "../src/create-runtime-injection-policy-command.js";
import { disableRuntimeInjectionPolicyCommand } from "../src/runtime-injection-policy-commands.js";
import { getRuntimeInjectionPolicyShow } from "../src/runtime-injection-policy-commands.js";
import { RuntimeInjectionPolicyError } from "../src/runtime-injection-policy-error.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);
const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const REQ = requestId.brand("req_00000000000000000000000001");

const POLICY_ID = "rp_00000000000000000000000010";
const POLICY_ID_TWO = "rp_00000000000000000000000011";
const POLICY_ID_REJECT_NOT_FOUND = "rp_00000000000000000000000012";
const POLICY_ID_REJECT_CROSS_ENV = "rp_00000000000000000000000013";
const PROTECTED_ENV_ID = "env_00000000000000000000000088";
const PROTECTED_SECRET_ID = "sec_00000000000000000000000088";
const PROTECTED_SECRET_VERSION_ID = "sv_00000000000000000000000088";
const NONEXISTENT_SECRET_ID = "sec_00000000000000000000000099";

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

async function ensureProtectedEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ db, sql }) => {
    const store = new TenantEnvironmentLifecycleStore(db);
    const protectedEnvId = environmentId.brand(PROTECTED_ENV_ID);
    const existing = await store.getById(ORG_A, protectedEnvId);
    if (existing === null) {
      await store.create({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: protectedEnvId,
        displayName: displayName("protected-preview"),
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
      });
    }

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
        ${PROTECTED_SECRET_ID},
        ${TEST_ORG_A_ID},
        ${TEST_PROJECT_A_ID},
        ${PROTECTED_ENV_ID},
        ${"PROTECTED_SYNTHETIC_KEY"},
        NULL
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO secret_versions (
        id,
        org_id,
        secret_id,
        version_number,
        organization_data_key_version,
        project_data_key_version,
        ciphertext_storage_ref,
        lifecycle_state,
        value_byte_length,
        encoding_class,
        is_empty,
        has_leading_or_trailing_whitespace,
        looks_like_placeholder,
        secret_shape_match_verdict
      )
      VALUES (
        ${PROTECTED_SECRET_VERSION_ID},
        ${TEST_ORG_A_ID},
        ${PROTECTED_SECRET_ID},
        ${1},
        ${1},
        ${1},
        ${"synthetic-ciphertext-ref"},
        ${"live"},
        ${0},
        ${"utf-8"},
        ${true},
        ${false},
        ${false},
        ${"no_shape_rule"}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      UPDATE secrets
      SET current_version_id = ${PROTECTED_SECRET_VERSION_ID},
          live_version_number = ${1}
      WHERE id = ${PROTECTED_SECRET_ID}
    `;
  });
}

async function cleanupProtectedEnvironment(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    await sql`DELETE FROM secret_versions WHERE secret_id = ${PROTECTED_SECRET_ID}`;
    await sql`DELETE FROM secrets WHERE id = ${PROTECTED_SECRET_ID}`;
    await sql`DELETE FROM environments WHERE id = ${PROTECTED_ENV_ID}`;
  });
}

async function cleanupPolicies(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    for (const policyId of [
      POLICY_ID,
      POLICY_ID_TWO,
      POLICY_ID_REJECT_NOT_FOUND,
      POLICY_ID_REJECT_CROSS_ENV,
    ]) {
      await sql`UPDATE runtime_injection_policies SET active_version_id = NULL WHERE id = ${policyId}`;
      await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${policyId}`;
      await sql`DELETE FROM runtime_injection_policies WHERE id = ${policyId}`;
    }
  });
}

describeIntegration("runtime injection policy commands (INS-437)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupPolicies();
    await ensureProtectedEnvironment();
  });

  afterAll(async () => {
    await cleanupPolicies();
    await cleanupProtectedEnvironment();
    await closeRuntimeSql();
  });

  it("creates a policy version with exact bindings and records audit metadata", async () => {
    const created = await createRuntimeInjectionPolicyCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      displayName: displayName("migration"),
      command: "npm run deploy",
      commandFingerprint: "sha256:fixture",
      secretIds: [TEST_SECRET_A_ID],
      requestId: REQ,
    });

    expect(created.activeVersion.secretIds).toEqual([TEST_SECRET_A_ID]);
    expect(created.activeVersion.variableKeys).toEqual([]);
    expect(created.auditEventId).toMatch(/^aud_/);

    const shown = await getRuntimeInjectionPolicyShow({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
    });
    expect(shown.activeVersion?.policyVersionId).toBe(created.policyVersionId);
    expect(shown.activeVersion?.command).toBe("npm run deploy");
  });

  it("disables a policy with audited metadata-only outcome", async () => {
    const disabled = await disableRuntimeInjectionPolicyCommand({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      comment: "retire migration flow",
      requestId: REQ,
    });

    expect(disabled.policyId).toBe(runtimePolicyId.brand(POLICY_ID));
    expect(disabled.auditEventId).toMatch(/^aud_/);

    const shown = await getRuntimeInjectionPolicyShow({
      actor: OWNER_ACTOR,
      organizationId: ORG_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
    });
    expect(shown.disabledAt).not.toBeNull();
  });

  it("fail-closes protected policy create with real high-assurance handoff", async () => {
    const protectedEnv = environmentId.brand(PROTECTED_ENV_ID);
    const policyId = runtimePolicyId.brand(POLICY_ID_TWO);

    let handoffError: unknown;
    try {
      await createRuntimeInjectionPolicyCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: protectedEnv,
        policyId,
        displayName: displayName("preview-deploy"),
        command: "npm run deploy",
        secretIds: [PROTECTED_SECRET_ID],
        requestId: REQ,
      });
      expect.fail("expected HighAssuranceHandoffError");
    } catch (error) {
      handoffError = error;
    }

    expect(handoffError).toBeInstanceOf(HighAssuranceHandoffError);
    expect(handoffError).toMatchObject({
      operationId: expect.stringMatching(/^op_/),
    });

    const policy = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantRuntimeInjectionPolicyStore(db);
        return store.getPolicyById(ORG_A, policyId);
      },
    );
    expect(policy).toBeNull();

    await expect(
      getRuntimeInjectionPolicyShow({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        policyId,
      }),
    ).rejects.toBeInstanceOf(RuntimeInjectionPolicyError);
  });

  it("rejects create when a bound secret id does not exist in policy scope", async () => {
    await expect(
      createRuntimeInjectionPolicyCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand(POLICY_ID_REJECT_NOT_FOUND),
        displayName: displayName("missing-secret"),
        command: "npm run deploy",
        secretIds: [NONEXISTENT_SECRET_ID],
        requestId: REQ,
      }),
    ).rejects.toMatchObject({
      code: RUNTIME_POLICY_ERROR_CODES.secretBindingNotFound,
    });
  });

  it("rejects create when a bound secret id belongs to a different environment", async () => {
    await expect(
      createRuntimeInjectionPolicyCommand({
        actor: OWNER_ACTOR,
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand(POLICY_ID_REJECT_CROSS_ENV),
        displayName: displayName("cross-env-secret"),
        command: "npm run deploy",
        secretIds: [PROTECTED_SECRET_ID],
        requestId: REQ,
      }),
    ).rejects.toMatchObject({
      code: RUNTIME_POLICY_ERROR_CODES.secretBindingEnvironmentMismatch,
    });
  });
});
