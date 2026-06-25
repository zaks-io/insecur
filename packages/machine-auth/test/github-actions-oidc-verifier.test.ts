import { describe, expect, it } from "vitest";
import { verifyGitHubActionsOidcToken } from "../src/github-actions-oidc-verifier.js";
import { GITHUB_ACTIONS_OIDC_ISSUER } from "../src/constants.js";
import {
  buildGitHubActionsOidcClaims,
  createTestGitHubActionsOidcSigner,
} from "../src/testing/sign-github-actions-oidc.js";

describe("verifyGitHubActionsOidcToken", () => {
  it("verifies RS256 GitHub Actions OIDC tokens and extracts claims", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: "insecur://oidc/github-actions",
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: Math.floor(Date.now() / 1000) + 600,
      }),
    );

    const verified = await verifyGitHubActionsOidcToken(token, signer.jwks);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.issuer).toBe(GITHUB_ACTIONS_OIDC_ISSUER);
      expect(verified.claims.repository).toBe("insecur-ci/example");
      expect(verified.claims.environment).toBe("production");
    }
  });

  it("rejects tampered tokens", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: "insecur://oidc/github-actions",
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: Math.floor(Date.now() / 1000) + 600,
      }),
    );

    const verified = await verifyGitHubActionsOidcToken(`${token}x`, signer.jwks);
    expect(verified.ok).toBe(false);
  });
});
