import {
  AUTHORIZATION_SCOPES,
  CREDENTIAL_SCOPES,
  RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ENV_B_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { exchangeEnvironmentDeployKey } from "../src/exchange-environment-deploy-key.js";
import { hashDeployKeySecret } from "../src/deploy-key-secret.js";
import { verifyMachineAccessToken } from "../src/machine-access-token.js";
import { buildEnvironmentDeployKeyMetadata } from "../src/environment-deploy-key-metadata.js";
import { createDeployKeyTestSecret } from "./helpers/deploy-key-test-secret.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const TEST_MACHINE_ID = "mach_00000000000000000000000004";
const TEST_AUTH_METHOD_ID = "mauth_00000000000000000000000004";
const TEST_POLICY_KEY_ID = "rp_00000000000000000000000001";
const SECOND_POLICY_KEY_ID = "rp_00000000000000000000000003";
const DISALLOWED_POLICY_KEY_ID = "rp_00000000000000000000000002";
const SIGNING_SECRET = "integration-machine-access-signing-secret";
const NOW = 1_700_000_000;

describeIntegration("exchangeEnvironmentDeployKey (tenant-scoped store)", () => {
  let deployKeySecret = "";
  let verifier = hashDeployKeySecret("");

  beforeAll(async () => {
    deployKeySecret = createDeployKeyTestSecret();
    verifier = hashDeployKeySecret(deployKeySecret);
    await seedTenantBaseline();
    const org = organizationId.brand(TEST_ORG_A_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO machine_identities (id, org_id, display_name)
        VALUES (${TEST_MACHINE_ID}, ${TEST_ORG_A_ID}, ${"Deploy key automation"})
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO machine_identity_memberships (
          id,
          org_id,
          machine_identity_id,
          project_id,
          authorization_scopes
        )
        VALUES (
          ${"mem_00000000000000000000000007"},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_ID},
          ${TEST_PROJECT_A_ID},
          ${[
            AUTHORIZATION_SCOPES.runtimeInjectionRun,
            AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
            AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
          ]}
        )
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO machine_identity_environment_deploy_keys (
          id,
          org_id,
          machine_identity_id,
          project_id,
          environment_id,
          runtime_policy_key_ids,
          credential_scopes,
          secret_hash_algorithm,
          secret_hash_salt_b64,
          secret_hash_b64,
          status,
          expires_at,
          non_expiring,
          rotation_interval_seconds,
          rotation_reminder_interval_seconds
        )
        VALUES (
          ${TEST_AUTH_METHOD_ID},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_ID},
          ${TEST_PROJECT_A_ID},
          ${TEST_ENV_A_ID},
          ${[TEST_POLICY_KEY_ID]},
          ${[...RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE]},
          ${verifier.algorithm},
          ${verifier.saltB64},
          ${verifier.hashB64},
          ${"active"},
          ${new Date((NOW + 86_400) * 1000).toISOString()},
          ${false},
          ${2_592_000},
          ${604_800}
        )
        ON CONFLICT (id) DO UPDATE SET
          secret_hash_algorithm = EXCLUDED.secret_hash_algorithm,
          secret_hash_salt_b64 = EXCLUDED.secret_hash_salt_b64,
          secret_hash_b64 = EXCLUDED.secret_hash_b64,
          status = EXCLUDED.status,
          expires_at = EXCLUDED.expires_at
      `;
    });
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("exchanges a trusted deploy key for a short-lived machine access token", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.machineIdentityId).toBe(machineIdentityId.brand(TEST_MACHINE_ID));
      expect(result.environmentId).toBe(environmentId.brand(TEST_ENV_A_ID));
      expect(result.runtimePolicyKeyId).toBe(runtimePolicyId.brand(TEST_POLICY_KEY_ID));
      expect(result.runtimePolicyKeyIds).toEqual([runtimePolicyId.brand(TEST_POLICY_KEY_ID)]);

      const verified = await verifyMachineAccessToken(result.accessToken, SIGNING_SECRET);
      expect(verified.ok).toBe(true);
      if (verified.ok) {
        expect(verified.token.runtimePolicyKeyId).toBe(runtimePolicyId.brand(TEST_POLICY_KEY_ID));
        expect(verified.token.credentialScopes).toEqual(
          expect.arrayContaining([CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected]),
        );
      }
    }
  });

  it("resolves protected issuance for exchanged deploy-key credentials at the environment coordinate", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const exchangeResult = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(exchangeResult.ok).toBe(true);
    if (!exchangeResult.ok) {
      return;
    }

    const verified = await verifyMachineAccessToken(exchangeResult.accessToken, SIGNING_SECRET);
    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }

    const effectiveAccess = await withTenantScope(
      { kind: "organization", organizationId: org },
      async () =>
        resolveEffectiveAccess(
          {
            type: "machine",
            machineIdentityId: machineIdentityId.brand(TEST_MACHINE_ID),
            tokenScope: {
              organizationId: org,
              projectId: projectId.brand(TEST_PROJECT_A_ID),
              environmentId: environmentId.brand(TEST_ENV_A_ID),
              runtimePolicyKeyId: runtimePolicyId.brand(TEST_POLICY_KEY_ID),
            },
            credentialScopes: verified.token.credentialScopes,
          },
          {
            organizationId: org,
            projectId: projectId.brand(TEST_PROJECT_A_ID),
            environmentId: environmentId.brand(TEST_ENV_A_ID),
          },
        ),
    );

    expect(
      hasAuthorizationScope(
        effectiveAccess,
        AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
      ),
    ).toBe(true);
  });

  it("denies wrong-environment exchange before minting", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_B_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.deployKeyWrongEnvironment);
    }
  });

  it("denies runtime policy key ids outside the deploy key allowlist before minting", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          runtimePolicyKeyId: runtimePolicyId.brand(DISALLOWED_POLICY_KEY_ID),
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result).toEqual({
        ok: false,
        code: AUTH_ERROR_CODES.deployKeyInvalid,
        message: "Environment Deploy Key is invalid.",
        retryable: false,
      });
    }
  });

  it("denies exchange when multiple runtime policy keys are allowlisted but none is requested", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET runtime_policy_key_ids = ${[TEST_POLICY_KEY_ID, SECOND_POLICY_KEY_ID]}
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.deployKeyInvalid);
    }

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET runtime_policy_key_ids = ${[TEST_POLICY_KEY_ID]}
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });
  });

  it("denies disabled deploy keys before minting", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET status = 'disabled'
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.deployKeyDisabled);
    }

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET status = 'active'
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });
  });

  it("denies expired deploy keys before minting", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET expires_at = ${new Date((NOW - 60) * 1000).toISOString()},
            non_expiring = false
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: deployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.expired);
    }

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET expires_at = ${new Date((NOW + 86_400) * 1000).toISOString()}
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });
  });

  it("denies overbroad credential scopes before minting", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const overbroadDeployKeySecret = createDeployKeyTestSecret();
    const overbroadVerifier = hashDeployKeySecret(overbroadDeployKeySecret);
    const overbroadAuthMethodId = "mauth_00000000000000000000000005";

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO machine_identity_environment_deploy_keys (
          id,
          org_id,
          machine_identity_id,
          project_id,
          environment_id,
          runtime_policy_key_ids,
          credential_scopes,
          secret_hash_algorithm,
          secret_hash_salt_b64,
          secret_hash_b64,
          status,
          expires_at,
          non_expiring
        )
        VALUES (
          ${overbroadAuthMethodId},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_ID},
          ${TEST_PROJECT_A_ID},
          ${TEST_ENV_A_ID},
          ${[TEST_POLICY_KEY_ID]},
          ${[CREDENTIAL_SCOPES.runtimeInjectionRun, CREDENTIAL_SCOPES.secretNonProtectedWrite]},
          ${overbroadVerifier.algorithm},
          ${overbroadVerifier.saltB64},
          ${overbroadVerifier.hashB64},
          ${"active"},
          ${new Date((NOW + 86_400) * 1000).toISOString()},
          ${false}
        )
        ON CONFLICT (id) DO UPDATE SET
          credential_scopes = EXCLUDED.credential_scopes,
          secret_hash_algorithm = EXCLUDED.secret_hash_algorithm,
          secret_hash_salt_b64 = EXCLUDED.secret_hash_salt_b64,
          secret_hash_b64 = EXCLUDED.secret_hash_b64
      `;
    });

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeEnvironmentDeployKey({
          organizationId: org,
          projectId: projectId.brand(TEST_PROJECT_A_ID),
          environmentId: environmentId.brand(TEST_ENV_A_ID),
          deployKeySecret: overbroadDeployKeySecret,
          signingSecret: SIGNING_SECRET,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.deployKeyOverbroadScope);
    }
  });

  it("surfaces non-expiring risk in metadata-only output", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET non_expiring = true,
            expires_at = NULL
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });

    const rows = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        sql<
          {
            id: string;
            org_id: string;
            machine_identity_id: string;
            project_id: string;
            environment_id: string;
            runtime_policy_key_ids: string[];
            credential_scopes: string[];
            secret_hash_algorithm: string;
            secret_hash_salt_b64: string;
            secret_hash_b64: string;
            status: string;
            expires_at: Date | null;
            non_expiring: boolean;
            rotation_interval_seconds: number | null;
            rotation_reminder_interval_seconds: number | null;
            created_at: Date;
          }[]
        >`
          SELECT *
          FROM machine_identity_environment_deploy_keys
          WHERE id = ${TEST_AUTH_METHOD_ID}
        `,
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error("expected deploy key metadata row");
    }
    const metadata = buildEnvironmentDeployKeyMetadata(
      {
        id: machineAuthMethodId.brand(row.id),
        organizationId: organizationId.brand(row.org_id),
        machineIdentityId: machineIdentityId.brand(row.machine_identity_id),
        projectId: projectId.brand(row.project_id),
        environmentId: environmentId.brand(row.environment_id),
        runtimePolicyKeyIds: row.runtime_policy_key_ids.map((id) => runtimePolicyId.brand(id)),
        credentialScopes: row.credential_scopes as never,
        secretVerifier: {
          algorithm: row.secret_hash_algorithm as never,
          saltB64: row.secret_hash_salt_b64,
          hashB64: row.secret_hash_b64,
        },
        status: row.status as "active",
        expiresAt: row.expires_at,
        nonExpiring: row.non_expiring,
        rotationIntervalSeconds: row.rotation_interval_seconds,
        rotationReminderIntervalSeconds: row.rotation_reminder_interval_seconds,
        createdAt: row.created_at,
      },
      NOW,
    );

    expect(metadata.nonExpiringRiskVisible).toBe(true);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        UPDATE machine_identity_environment_deploy_keys
        SET non_expiring = false,
            expires_at = ${new Date((NOW + 86_400) * 1000).toISOString()}
        WHERE id = ${TEST_AUTH_METHOD_ID}
      `;
    });
  });
});
