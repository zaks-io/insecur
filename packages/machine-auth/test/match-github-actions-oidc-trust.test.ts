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
const REPOSITORY_ID = "123456789";
const REPOSITORY_OWNER_ID = "987654321";

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
    githubRepositoryId: REPOSITORY_ID,
    githubRepositoryOwnerId: REPOSITORY_OWNER_ID,
    githubEnvironment: "production",
    oidcAudience: "insecur://oidc/github-actions",
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    status: "active",
    ...overrides,
  };
}

function matchingClaims(
  overrides: Partial<{
    repository: string;
    repositoryId: string;
    repositoryOwnerId: string;
    environment: string;
    audience: readonly string[];
    expiresAtEpoch: number;
    issuer: string;
  }> = {},
) {
  return {
    issuer: GITHUB_ACTIONS_OIDC_ISSUER,
    subject: "repo:insecur-ci/example:environment:production",
    audience: ["insecur://oidc/github-actions"] as const,
    expiresAtEpoch: NOW + 600,
    repository: "insecur-ci/example",
    repositoryOwner: "insecur-ci",
    repositoryId: REPOSITORY_ID,
    repositoryOwnerId: REPOSITORY_OWNER_ID,
    environment: "production",
    ...overrides,
  };
}

const NOW = 1_700_000_000;

describe("matchGitHubActionsOidcTrust", () => {
  it("accepts matching stable repository identity, environment, and audience", () => {
    const result = matchGitHubActionsOidcTrust(matchingClaims(), [authMethod()], NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.authMethod.machineIdentityId).toBe(MACHINE);
    }
  });

  it("denies wrong issuer", () => {
    const result = matchGitHubActionsOidcTrust(
      matchingClaims({ issuer: "https://evil.example" }),
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
      matchingClaims({ expiresAtEpoch: NOW - 1 }),
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
      matchingClaims({ audience: ["https://wrong.example/aud"] }),
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_audience");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongAudience);
    }
  });

  it("denies wrong repository display name when stable identity also mismatches", () => {
    const result = matchGitHubActionsOidcTrust(
      matchingClaims({
        repository: "other-org/other-repo",
        repositoryId: "111111111",
        repositoryOwnerId: "222222222",
      }),
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_repository");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongRepository);
    }
  });

  it("denies matching repository display name with different stable repository identity", () => {
    const result = matchGitHubActionsOidcTrust(
      matchingClaims({
        repository: "insecur-ci/example",
        repositoryId: "999999999",
        repositoryOwnerId: REPOSITORY_OWNER_ID,
      }),
      [authMethod()],
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_repository");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcWrongRepository);
    }
  });

  it("denies matching repository display name after transfer-style owner id mismatch", () => {
    const result = matchGitHubActionsOidcTrust(
      matchingClaims({
        repository: "insecur-ci/example",
        repositoryId: REPOSITORY_ID,
        repositoryOwnerId: "555555555",
      }),
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
      matchingClaims({ environment: "staging" }),
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

  it("accepts renamed repository display name when stable identity still matches", () => {
    const result = matchGitHubActionsOidcTrust(
      matchingClaims({ repository: "insecur-ci/renamed-example" }),
      [authMethod({ githubRepository: "insecur-ci/example" })],
      NOW,
    );

    expect(result.ok).toBe(true);
  });

  it("denies ambiguous duplicate trusted sources", () => {
    const duplicate = authMethod({
      id: machineAuthMethodId.brand("mauth_00000000000000000000000002"),
    });

    const result = matchGitHubActionsOidcTrust(matchingClaims(), [authMethod(), duplicate], NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("untrusted_source");
      expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcUntrustedSource);
    }
  });
});
