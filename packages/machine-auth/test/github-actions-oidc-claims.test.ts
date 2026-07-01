import { describe, expect, it } from "vitest";
import { GITHUB_ACTIONS_OIDC_ISSUER } from "../src/constants.js";
import {
  assertGitHubActionsIssuer,
  audienceMatches,
  normalizeGitHubRepository,
  parseGitHubActionsOidcClaims,
} from "../src/github-actions-oidc-claims.js";

const BASE_CLAIMS = {
  iss: GITHUB_ACTIONS_OIDC_ISSUER,
  sub: "repo:insecur-ci/example:environment:production",
  aud: "insecur://oidc/github-actions",
  exp: 1_700_000_600,
  repository: "insecur-ci/example",
  repository_owner: "insecur-ci",
  repository_id: "123456789",
  repository_owner_id: "987654321",
  environment: "production",
};

describe("parseGitHubActionsOidcClaims", () => {
  it("parses string audience claims", () => {
    const claims = parseGitHubActionsOidcClaims(BASE_CLAIMS);
    expect(claims).toEqual({
      issuer: GITHUB_ACTIONS_OIDC_ISSUER,
      subject: BASE_CLAIMS.sub,
      audience: ["insecur://oidc/github-actions"],
      expiresAtEpoch: BASE_CLAIMS.exp,
      repository: "insecur-ci/example",
      repositoryOwner: "insecur-ci",
      repositoryId: "123456789",
      repositoryOwnerId: "987654321",
      environment: "production",
    });
  });

  it("parses numeric stable repository identity claims", () => {
    const claims = parseGitHubActionsOidcClaims({
      ...BASE_CLAIMS,
      repository_id: 123456789,
      repository_owner_id: 987654321,
    });
    expect(claims?.repositoryId).toBe("123456789");
    expect(claims?.repositoryOwnerId).toBe("987654321");
  });

  it("parses array audience claims", () => {
    const claims = parseGitHubActionsOidcClaims({
      ...BASE_CLAIMS,
      aud: ["insecur://oidc/github-actions", "https://github.com/insecur-ci"],
    });
    expect(claims?.audience).toEqual([
      "insecur://oidc/github-actions",
      "https://github.com/insecur-ci",
    ]);
  });

  it("omits optional environment when absent", () => {
    const withoutEnvironment = { ...BASE_CLAIMS };
    delete (withoutEnvironment as { environment?: string }).environment;
    const claims = parseGitHubActionsOidcClaims(withoutEnvironment);
    expect(claims?.environment).toBeUndefined();
  });

  it.each([
    ["iss", { ...BASE_CLAIMS, iss: "" }],
    ["sub", { ...BASE_CLAIMS, sub: "" }],
    ["repository", { ...BASE_CLAIMS, repository: "" }],
    ["repository_owner", { ...BASE_CLAIMS, repository_owner: "" }],
    ["repository_id", { ...BASE_CLAIMS, repository_id: "" }],
    ["repository_id", { ...BASE_CLAIMS, repository_id: "not-numeric" }],
    ["repository_owner_id", { ...BASE_CLAIMS, repository_owner_id: "" }],
    ["repository_owner_id", { ...BASE_CLAIMS, repository_owner_id: -1 }],
    ["exp", { ...BASE_CLAIMS, exp: "not-a-number" }],
    ["exp", { ...BASE_CLAIMS, exp: Number.NaN }],
    ["aud", { ...BASE_CLAIMS, aud: [] }],
    ["aud", { ...BASE_CLAIMS, aud: [""] }],
    ["aud", { ...BASE_CLAIMS, aud: 123 }],
    ["aud", { ...BASE_CLAIMS, aud: ["valid", 1] }],
    ["iss", { ...BASE_CLAIMS, iss: undefined }],
    ["repository_id", { ...BASE_CLAIMS, repository_id: undefined }],
    ["repository_owner_id", { ...BASE_CLAIMS, repository_owner_id: undefined }],
  ] as const)("returns null when %s is invalid", (_field, payload) => {
    expect(parseGitHubActionsOidcClaims(payload as Record<string, unknown>)).toBeNull();
  });
});

describe("assertGitHubActionsIssuer", () => {
  it("accepts the GitHub Actions issuer", () => {
    expect(assertGitHubActionsIssuer(GITHUB_ACTIONS_OIDC_ISSUER)).toBe(true);
  });

  it("rejects other issuers", () => {
    expect(assertGitHubActionsIssuer("https://evil.example")).toBe(false);
  });
});

describe("normalizeGitHubRepository", () => {
  it("trims and lowercases repository slugs", () => {
    expect(normalizeGitHubRepository("  InSecur-CI/Example  ")).toBe("insecur-ci/example");
  });
});

describe("audienceMatches", () => {
  it("matches when the expected audience is present", () => {
    expect(
      audienceMatches(["insecur://oidc/github-actions", "other"], "insecur://oidc/github-actions"),
    ).toBe(true);
  });

  it("does not match missing audiences", () => {
    expect(audienceMatches(["other"], "insecur://oidc/github-actions")).toBe(false);
  });
});
