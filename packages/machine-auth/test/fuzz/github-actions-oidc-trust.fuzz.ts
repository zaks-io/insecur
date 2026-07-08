import { CREDENTIAL_SCOPES } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { GITHUB_ACTIONS_OIDC_ISSUER } from "../../src/constants.js";
import type { GitHubActionsOidcAuthMethodRow } from "../../src/github-actions-oidc-auth-method-row.js";
import { matchGitHubActionsOidcTrust } from "../../src/match-github-actions-oidc-trust.js";

interface TrustBase {
  readonly audience: string;
  readonly repositoryId: string;
  readonly repositoryOwnerId: string;
  readonly environment?: string | undefined;
}

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000001");
const SECOND_AUTH_METHOD = machineAuthMethodId.brand("mauth_00000000000000000000000002");
const NOW = 1_700_000_000;

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 80 });
const numericIdArb = fc.integer({ min: 1, max: 2_147_483_647 }).map(String);
const trustBaseArb: fc.Arbitrary<TrustBase> = fc.record({
  audience: nonEmptyStringArb,
  repositoryId: numericIdArb,
  repositoryOwnerId: numericIdArb,
  environment: fc.option(nonEmptyStringArb, { nil: undefined }),
});

function authMethod(
  input: TrustBase,
  overrides: Partial<GitHubActionsOidcAuthMethodRow> = {},
): GitHubActionsOidcAuthMethodRow {
  return {
    id: AUTH_METHOD,
    organizationId: ORG,
    machineIdentityId: MACHINE,
    projectId: PROJECT,
    environmentId: ENV,
    githubRepository: "display/name",
    githubRepositoryId: input.repositoryId,
    githubRepositoryOwnerId: input.repositoryOwnerId,
    githubEnvironment: input.environment ?? null,
    oidcAudience: input.audience,
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    status: "active",
    ...overrides,
  };
}

function matchingClaims(input: TrustBase) {
  return {
    issuer: GITHUB_ACTIONS_OIDC_ISSUER,
    subject: "repo:display/name:ref:refs/heads/main",
    audience: [input.audience],
    expiresAtEpoch: NOW + 600,
    repository: "renamed/display",
    repositoryOwner: "renamed",
    repositoryId: input.repositoryId,
    repositoryOwnerId: input.repositoryOwnerId,
    ...(input.environment !== undefined ? { environment: input.environment } : {}),
  };
}

function applyTrustMismatch(
  input: TrustBase,
  mode: string,
): {
  claims: ReturnType<typeof matchingClaims>;
  methods: GitHubActionsOidcAuthMethodRow[];
} {
  const claims = matchingClaims(input);
  const methods = [authMethod(input)];

  if (mode === "issuer") {
    claims.issuer = "https://evil.example";
  } else if (mode === "expired") {
    claims.expiresAtEpoch = NOW;
  } else if (mode === "audience") {
    claims.audience = [`${input.audience}-wrong`];
  } else if (mode === "repo") {
    claims.repositoryId = `${input.repositoryId}9`;
  } else if (mode === "owner") {
    claims.repositoryOwnerId = `${input.repositoryOwnerId}9`;
  } else if (mode === "environment") {
    methods[0] = authMethod(input, { githubEnvironment: "production" });
    delete claims.environment;
  } else {
    methods.push(authMethod(input, { id: SECOND_AUTH_METHOD }));
  }

  return { claims, methods };
}

describe("GitHub Actions OIDC trust matching fuzz", () => {
  it("accepts exactly one method matching stable identity, audience, expiry, issuer, and environment", () => {
    fc.assert(
      fc.property(trustBaseArb, (input) => {
        const result = matchGitHubActionsOidcTrust(matchingClaims(input), [authMethod(input)], NOW);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.authMethod.githubRepositoryId).toBe(input.repositoryId);
        }
      }),
    );
  });

  it("fails closed on each trust-axis mismatch and on duplicate matches", () => {
    fc.assert(
      fc.property(
        trustBaseArb,
        fc.constantFrom(
          "issuer",
          "expired",
          "audience",
          "repo",
          "owner",
          "environment",
          "duplicate",
        ),
        (input, mode) => {
          const { claims, methods } = applyTrustMismatch(input, mode);
          const result = matchGitHubActionsOidcTrust(claims, methods, NOW);

          expect(result.ok).toBe(false);
          if (!result.ok && mode === "duplicate") {
            expect(result.reasonCode).toBe(AUTH_ERROR_CODES.oidcUntrustedSource);
          }
        },
      ),
    );
  });
});
