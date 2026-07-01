import { CREDENTIAL_SCOPES } from "@insecur/access";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeGitHubActionsOidc } from "../src/exchange-github-actions-oidc.js";
import type { GitHubActionsOidcAuthMethodRow } from "../src/github-actions-oidc-auth-method-row.js";
import {
  buildGitHubActionsOidcClaims,
  createTestGitHubActionsOidcSigner,
} from "../src/testing/sign-github-actions-oidc.js";
import { createFakeTenantSql } from "../../operations/test/helpers/fake-tenant-sql.js";

vi.mock("@insecur/audit", () => ({
  PRODUCTION_AUDIT_EVENT_CODES: {
    machineGithubActionsOidcExchanged: "machine.github_actions_oidc.exchanged",
    machineGithubActionsOidcExchangeDenied: "machine.github_actions_oidc.exchange_denied",
  },
  writeAuditEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000001");
const AUDIENCE = "insecur://oidc/github-actions";
const SIGNING_SECRET = "unit-machine-access-signing-secret";
const NOW = 1_700_000_000;
const REPOSITORY_ID = "123456789";
const REPOSITORY_OWNER_ID = "987654321";

function authMethodRow(): GitHubActionsOidcAuthMethodRow {
  return {
    id: AUTH_METHOD,
    organizationId: ORG,
    machineIdentityId: MACHINE,
    projectId: PROJECT,
    environmentId: ENV,
    githubRepository: "insecur-ci/example",
    githubRepositoryId: REPOSITORY_ID,
    githubRepositoryOwnerId: REPOSITORY_OWNER_ID,
    githubEnvironment: "production",
    oidcAudience: AUDIENCE,
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    status: "active",
  };
}

function sqlReturningAuthMethods(
  rows: readonly GitHubActionsOidcAuthMethodRow[] = [authMethodRow()],
) {
  return createFakeTenantSql((_query, values) => {
    expect(values[0]).toBe(ORG);
    return rows.map((row) => ({
      id: row.id,
      org_id: row.organizationId,
      machine_identity_id: row.machineIdentityId,
      project_id: row.projectId,
      environment_id: row.environmentId,
      github_repository: row.githubRepository,
      github_repository_id: row.githubRepositoryId,
      github_repository_owner_id: row.githubRepositoryOwnerId,
      github_environment: row.githubEnvironment,
      oidc_audience: row.oidcAudience,
      credential_scopes: [...row.credentialScopes],
      status: row.status,
    }));
  });
}

describe("exchangeGitHubActionsOidc (unit)", () => {
  const signerPromise = createTestGitHubActionsOidcSigner();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges a trusted OIDC token without touching Postgres integration fixtures", async () => {
    const signer = await signerPromise;
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        repositoryId: REPOSITORY_ID,
        repositoryOwnerId: REPOSITORY_OWNER_ID,
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await exchangeGitHubActionsOidc({
      organizationId: ORG,
      oidcToken: token,
      signingSecret: SIGNING_SECRET,
      jwks: signer.jwks,
      sql: sqlReturningAuthMethods(),
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.machineIdentityId).toBe(MACHINE);
      expect(result.accessToken.split(".")).toHaveLength(3);
    }
  });

  it("denies malformed OIDC tokens before loading auth methods", async () => {
    const signer = await signerPromise;
    const sql = vi.fn();
    const fakeSql = createFakeTenantSql(() => {
      sql();
      return [];
    });

    const result = await exchangeGitHubActionsOidc({
      organizationId: ORG,
      oidcToken: "not-a-jwt",
      signingSecret: SIGNING_SECRET,
      jwks: signer.jwks,
      sql: fakeSql,
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.invalid,
      message: "GitHub Actions OIDC token is invalid.",
      retryable: false,
    });
    expect(sql).not.toHaveBeenCalled();
  });

  it("denies expired OIDC tokens before trust matching", async () => {
    const signer = await signerPromise;
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        repositoryId: REPOSITORY_ID,
        repositoryOwnerId: REPOSITORY_OWNER_ID,
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: NOW - 60,
      }),
    );

    const result = await exchangeGitHubActionsOidc({
      organizationId: ORG,
      oidcToken: token,
      signingSecret: SIGNING_SECRET,
      jwks: signer.jwks,
      sql: sqlReturningAuthMethods(),
      nowEpoch: NOW,
    });

    expect(result).toEqual({
      ok: false,
      code: AUTH_ERROR_CODES.expired,
      message: "GitHub Actions OIDC token has expired.",
      retryable: false,
    });
  });

  it("denies wrong repository claims with audit context", async () => {
    const signer = await signerPromise;
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: AUDIENCE,
        repository: "other-org/other-repo",
        repositoryOwner: "other-org",
        repositoryId: "111111111",
        repositoryOwnerId: "222222222",
        subject: "repo:other-org/other-repo:environment:production",
        environment: "production",
        expiresAtEpoch: NOW + 600,
      }),
    );

    const result = await exchangeGitHubActionsOidc({
      organizationId: ORG,
      oidcToken: token,
      signingSecret: SIGNING_SECRET,
      jwks: signer.jwks,
      sql: sqlReturningAuthMethods(),
      nowEpoch: NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(AUTH_ERROR_CODES.oidcWrongRepository);
      expect(result.message).toBe(
        "GitHub Actions OIDC token repository is not trusted for this Organization.",
      );
    }
  });
});
