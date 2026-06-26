import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { CREDENTIAL_SCOPES } from "@insecur/access";
import { describe, expect, it } from "vitest";
import type { GitHubActionsOidcAuthMethodRow } from "../src/github-actions-oidc-auth-method-row.js";
import { GITHUB_ACTIONS_OIDC_ISSUER } from "../src/constants.js";
import { matchGitHubActionsOidcTrust } from "../src/match-github-actions-oidc-trust.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000001");

function authMethod(
  overrides: Partial<GitHubActionsOidcAuthMethodRow> = {},
): GitHubActionsOidcAuthMethodRow {
  return {
    id: AUTH_METHOD,
    organizationId: ORG,
    machineIdentityId: MACHINE,
    projectId: PROJECT,
    environmentId: ENV,
    githubRepository: "insecur-ci/example",
    githubEnvironment: "production",
    oidcAudience: "insecur://oidc/github-actions",
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    status: "active",
    ...overrides,
  };
}

const NOW = 1_700_000_000;

describe("matchGitHubActionsOidcTrust", () => {
  it("accepts matching repository, environment, and audience", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:insecur-ci/example:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authMethod.machineIdentityId).toBe(MACHINE);
    }
  });

  it("denies wrong issuer", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: "https://evil.example",
        subject: "repo:insecur-ci/example:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod()],
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      reasonCode: AUTH_ERROR_CODES.invalid,
    });
  });

  it("denies expired tokens before minting", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:insecur-ci/example:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW - 1,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod()],
      NOW,
    );

    expect(result).toEqual({
      ok: false,
      reason: "expired",
      reasonCode: AUTH_ERROR_CODES.expired,
    });
  });

  it("denies wrong audience", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:insecur-ci/example:environment:production",
        audience: ["https://wrong.example/aud"],
        expiresAtEpoch: NOW + 600,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_audience");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongAudience);
    }
  });

  it("denies wrong repository", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:other-org/other-repo:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "other-org/other-repo",
        repositoryOwner: "other-org",
        environment: "production",
      },
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_repository");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongRepository);
    }
  });

  it("denies wrong environment", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:insecur-ci/example:environment:staging",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "staging",
      },
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_environment");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongEnvironment);
      expect(result.authMethod?.githubEnvironment).toBe("production");
    }
  });

  it("matches repositories case-insensitively", () => {
    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:InSecur-CI/Example:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "InSecur-CI/Example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod({ githubRepository: "insecur-ci/example" })],
      NOW,
    );

    expect(result.ok).toBe(true);
  });

  it("denies ambiguous duplicate trusted sources", () => {
    const duplicate = authMethod({
      id: machineAuthMethodId.brand("mauth_00000000000000000000000002"),
    });

    const result = matchGitHubActionsOidcTrust(
      {
        issuer: GITHUB_ACTIONS_OIDC_ISSUER,
        subject: "repo:insecur-ci/example:environment:production",
        audience: ["insecur://oidc/github-actions"],
        expiresAtEpoch: NOW + 600,
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        environment: "production",
      },
      [authMethod(), duplicate],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("untrusted_source");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcUntrustedSource);
    }
  });
});
