import { AUTHORIZATION_SCOPES, CREDENTIAL_SCOPES } from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import { environmentId, machineIdentityId, organizationId, projectId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql, withTenantScope } from "@insecur/tenant-store";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
} from "../../tenant-store/test/rls/test-ids.js";
import { exchangeGitHubActionsOidc } from "../src/exchange-github-actions-oidc.js";
import { verifyMachineAccessToken } from "../src/machine-access-token.js";
import {
  buildGitHubActionsOidcClaims,
  createTestGitHubActionsOidcSigner,
} from "../src/testing/sign-github-actions-oidc.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const TEST_MACHINE_ID = "mach_00000000000000000000000001";
const TEST_AUTH_METHOD_ID = "mauth_00000000000000000000000001";
const AUDIENCE = "insecur://oidc/github-actions";
const SIGNING_SECRET = "integration-machine-access-signing-secret";
const NOW = 1_700_000_000;

describeIntegration("exchangeGitHubActionsOidc (tenant-scoped store)", () => {
  const signerPromise = createTestGitHubActionsOidcSigner();

  beforeAll(async () => {
    await seedTenantBaseline();
    const org = organizationId.brand(TEST_ORG_A_ID);

    await withTenantScope({ kind: "organization", organizationId: org }, async ({ sql }) => {
      await sql`
        INSERT INTO machine_identities (id, org_id, display_name)
        VALUES (${TEST_MACHINE_ID}, ${TEST_ORG_A_ID}, ${"GitHub Actions deploy"})
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
          ${"mem_00000000000000000000000006"},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_ID},
          ${TEST_PROJECT_A_ID},
          ${sql.array(
            [
              AUTHORIZATION_SCOPES.runtimeInjectionRun,
              AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
            ],
            "text",
          )}
        )
        ON CONFLICT (id) DO NOTHING
      `;

      await sql`
        INSERT INTO machine_identity_github_actions_oidc (
          id,
          org_id,
          machine_identity_id,
          project_id,
          environment_id,
          github_repository,
          github_environment,
          oidc_audience,
          credential_scopes
        )
        VALUES (
          ${TEST_AUTH_METHOD_ID},
          ${TEST_ORG_A_ID},
          ${TEST_MACHINE_ID},
          ${TEST_PROJECT_A_ID},
          ${TEST_ENV_A_ID},
          ${"insecur-ci/example"},
          ${"production"},
          ${AUDIENCE},
          ${sql.array(
            [CREDENTIAL_SCOPES.runtimeInjectionRun, CREDENTIAL_SCOPES.runtimeInjectionGrantIssue],
            "text",
          )}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    });
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("exchanges a trusted OIDC token for a short-lived machine access token", async () => {
    const signer = await signerPromise;
    const org = organizationId.brand(TEST_ORG_A_ID);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeGitHubActionsOidc({
          organizationId: org,
          oidcToken: token,
          signingSecret: SIGNING_SECRET,
          jwks: signer.jwks,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.machineIdentityId).toBe(machineIdentityId.brand(TEST_MACHINE_ID));
      expect(result.projectId).toBe(projectId.brand(TEST_PROJECT_A_ID));
      expect(result.environmentId).toBe(environmentId.brand(TEST_ENV_A_ID));

      const verified = await verifyMachineAccessToken(result.accessToken, SIGNING_SECRET);
      expect(verified.ok).toBe(true);
    }
  });

  it("denies wrong repository claims before minting", async () => {
    const signer = await signerPromise;
    const org = organizationId.brand(TEST_ORG_A_ID);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "other-org/other-repo",
        repositoryOwner: "other-org",
        subject: "repo:other-org/other-repo:environment:production",
        environment: "production",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeGitHubActionsOidc({
          organizationId: org,
          oidcToken: token,
          signingSecret: SIGNING_SECRET,
          jwks: signer.jwks,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.oidcWrongRepository);
    }
  });

  it("denies wrong environment claims before minting", async () => {
    const signer = await signerPromise;
    const org = organizationId.brand(TEST_ORG_A_ID);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:staging",
        environment: "staging",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeGitHubActionsOidc({
          organizationId: org,
          oidcToken: token,
          signingSecret: SIGNING_SECRET,
          jwks: signer.jwks,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.oidcWrongEnvironment);
    }
  });

  it("denies expired OIDC tokens before minting", async () => {
    const signer = await signerPromise;
    const org = organizationId.brand(TEST_ORG_A_ID);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: NOW - 60,
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeGitHubActionsOidc({
          organizationId: org,
          oidcToken: token,
          signingSecret: SIGNING_SECRET,
          jwks: signer.jwks,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.expired);
    }
  });

  it("denies wrong audience before minting", async () => {
    const signer = await signerPromise;
    const org = organizationId.brand(TEST_ORG_A_ID);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: "https://unexpected-audience.example",
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ sql }) =>
        exchangeGitHubActionsOidc({
          organizationId: org,
          oidcToken: token,
          signingSecret: SIGNING_SECRET,
          jwks: signer.jwks,
          sql,
          nowEpoch: NOW,
        }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.oidcWrongAudience);
    }
  });
});
