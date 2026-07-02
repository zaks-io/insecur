import { resolveEffectiveAccess } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  RUNTIME_POLICY_ERROR_CODES,
  runtimePolicyId,
  runtimePolicyVersionId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import {
  RUNTIME_INJECTION_DELIVERY_MODES,
  TenantRuntimeInjectionPolicyStore,
  closeRuntimeSql,
  withTenantScope,
} from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_SECRET_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import {
  createAuthorizedRuntimeInjectionPolicy,
  publishAuthorizedRuntimeInjectionPolicyVersion,
} from "../src/runtime-injection-policies.js";
import { RuntimeInjectionPolicyError } from "../src/runtime-injection-policy-error.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG_A = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const ENV_A = environmentId.brand(TEST_ENV_A_ID);
const OWNER_ACTOR = { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
const READ_ONLY_ACTOR = {
  type: "user" as const,
  userId: userId.brand("usr_00000000000000000000000075"),
};
const READ_ONLY_MEMBERSHIP_ID = "mem_00000000000000000000000075";

const POLICY_ID = "rp_00000000000000000000000001";
const VERSION_ONE_ID = "rpv_00000000000000000000000001";
const VERSION_TWO_ID = "rpv_00000000000000000000000002";

function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

function versionContent(secretIds: readonly string[] = [TEST_SECRET_A_ID]) {
  return {
    secretIds,
    variableKeys: [] as const,
    command: "npm run dev",
    ttlSeconds: 300,
    deliveryMode: RUNTIME_INJECTION_DELIVERY_MODES.environmentVariables,
  };
}

async function cleanupPolicies(): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
    await sql`UPDATE runtime_injection_policies SET active_version_id = NULL WHERE id = ${POLICY_ID}`;
    await sql`DELETE FROM runtime_injection_policy_versions WHERE policy_id = ${POLICY_ID}`;
    await sql`DELETE FROM runtime_injection_policies WHERE id = ${POLICY_ID}`;
    await sql`DELETE FROM memberships WHERE id = ${READ_ONLY_MEMBERSHIP_ID}`;
  });
}

describeIntegration("runtime injection policies (INS-63)", () => {
  beforeAll(async () => {
    await seedTenantBaseline();
    await cleanupPolicies();
    await withTenantScope({ kind: "organization", organizationId: ORG_A }, async ({ sql }) => {
      await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset, project_id)
        VALUES (
          ${READ_ONLY_MEMBERSHIP_ID},
          ${TEST_ORG_A_ID},
          NULL,
          ${READ_ONLY_ACTOR.userId},
          ${"read-only"},
          ${TEST_PROJECT_A_ID}
        )
      `;
    });
  });

  afterAll(async () => {
    await cleanupPolicies();
    await closeRuntimeSql();
  });

  it("denies unauthorized policy creation", async () => {
    const readOnlyAccess = await resolveEffectiveAccess(READ_ONLY_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
    });

    await expect(
      createAuthorizedRuntimeInjectionPolicy({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand(POLICY_ID),
        policyVersionId: runtimePolicyVersionId.brand(VERSION_ONE_ID),
        displayName: displayName("dev-web"),
        version: versionContent(),
        effectiveAccess: readOnlyAccess,
        accessCoordinate: {
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: ENV_A,
        },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("creates a policy with an immutable first version", async () => {
    const ownerAccess = await resolveEffectiveAccess(OWNER_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
    });

    const created = await createAuthorizedRuntimeInjectionPolicy({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_ONE_ID),
      displayName: displayName("dev-web"),
      version: versionContent(),
      effectiveAccess: ownerAccess,
      accessCoordinate: {
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
      },
    });

    expect(created.policy.activeVersionId).toBe(runtimePolicyVersionId.brand(VERSION_ONE_ID));
    expect(created.activeVersion.versionNumber).toBe(1);
    expect(created.activeVersion.secretIds).toHaveLength(1);
  });

  it("keeps prior policy versions immutable when publishing a new version", async () => {
    const ownerAccess = await resolveEffectiveAccess(OWNER_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
    });

    const published = await publishAuthorizedRuntimeInjectionPolicyVersion({
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
      policyId: runtimePolicyId.brand(POLICY_ID),
      policyVersionId: runtimePolicyVersionId.brand(VERSION_TWO_ID),
      displayName: displayName("dev-web"),
      version: {
        ...versionContent(),
        command: "npm run test",
      },
      effectiveAccess: ownerAccess,
      accessCoordinate: {
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
      },
    });

    expect(published.policy.activeVersionId).toBe(runtimePolicyVersionId.brand(VERSION_TWO_ID));
    expect(published.activeVersion.versionNumber).toBe(2);
    expect(published.activeVersion.command).toBe("npm run test");

    const firstVersion = await withTenantScope(
      { kind: "organization", organizationId: ORG_A },
      async ({ db }) => {
        const store = new TenantRuntimeInjectionPolicyStore(db);
        return store.getVersionById(
          ORG_A,
          runtimePolicyId.brand(POLICY_ID),
          runtimePolicyVersionId.brand(VERSION_ONE_ID),
        );
      },
    );

    expect(firstVersion?.command).toBe("npm run dev");
    expect(firstVersion?.versionNumber).toBe(1);
  });

  it("rejects duplicate display names within one environment", async () => {
    const ownerAccess = await resolveEffectiveAccess(OWNER_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
    });

    await expect(
      createAuthorizedRuntimeInjectionPolicy({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand("rp_00000000000000000000000002"),
        policyVersionId: runtimePolicyVersionId.brand("rpv_00000000000000000000000003"),
        displayName: displayName("dev-web"),
        version: versionContent(),
        effectiveAccess: ownerAccess,
        accessCoordinate: {
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: ENV_A,
        },
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.displayNameInUse });
  });

  it("rejects pattern-based bindings at create time", async () => {
    const ownerAccess = await resolveEffectiveAccess(OWNER_ACTOR, {
      organizationId: ORG_A,
      projectId: PROJECT_A,
      environmentId: ENV_A,
    });

    await expect(
      createAuthorizedRuntimeInjectionPolicy({
        organizationId: ORG_A,
        projectId: PROJECT_A,
        environmentId: ENV_A,
        policyId: runtimePolicyId.brand("rp_00000000000000000000000003"),
        policyVersionId: runtimePolicyVersionId.brand("rpv_00000000000000000000000004"),
        displayName: displayName("test-suite"),
        version: versionContent(["sec_*"]),
        effectiveAccess: ownerAccess,
        accessCoordinate: {
          organizationId: ORG_A,
          projectId: PROJECT_A,
          environmentId: ENV_A,
        },
      }),
    ).rejects.toBeInstanceOf(RuntimeInjectionPolicyError);
  });
});
