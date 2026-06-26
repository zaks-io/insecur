import { describe, expect, it } from "vitest";
import {
  jwkPublicKeysFromDocument,
  verifyGitHubActionsOidcToken,
} from "../src/github-actions-oidc-verifier.js";
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

  it("rejects expired tokens before returning success", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const nowEpoch = Math.floor(Date.now() / 1000);
    const token = await signer.sign(
      buildGitHubActionsOidcClaims({
        audience: "insecur://oidc/github-actions",
        repository: "insecur-ci/example",
        repositoryOwner: "insecur-ci",
        subject: "repo:insecur-ci/example:environment:production",
        environment: "production",
        expiresAtEpoch: nowEpoch - 60,
      }),
    );

    const verified = await verifyGitHubActionsOidcToken(token, signer.jwks, nowEpoch);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("expired");
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

  it("rejects empty JWKS key sets", async () => {
    const verified = await verifyGitHubActionsOidcToken("a.b.c", {
      getVerificationKeys: async () => [],
    });
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });

  it("maps malformed JWT structure to malformed verification failures", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const verified = await verifyGitHubActionsOidcToken("not-a-jwt", signer.jwks);
    expect(verified).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects valid signatures with missing GitHub Actions claims", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const token = await signer.sign({
      iss: GITHUB_ACTIONS_OIDC_ISSUER,
      exp: Math.floor(Date.now() / 1000) + 600,
    });

    const verified = await verifyGitHubActionsOidcToken(token, signer.jwks);
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });

  it("imports verification keys from JWKS documents", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const exported = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as Record<
      string,
      unknown
    >;

    const imported = await jwkPublicKeysFromDocument({
      keys: [{ ...exported, kid: "jwks-doc-key", alg: "RS256", use: "sig" }],
    });
    expect(imported).toHaveLength(1);
    expect(imported[0]?.kid).toBe("jwks-doc-key");
  });
});
