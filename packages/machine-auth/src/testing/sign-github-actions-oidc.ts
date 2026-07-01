import { bytesToBase64Url } from "@insecur/domain";
import { GITHUB_ACTIONS_OIDC_ISSUER } from "../constants.js";
import { importRs256PublicKeyFromJwk, type JwkPublicKey } from "../rs256-jwt.js";
import type { GitHubActionsOidcJwksPort } from "../github-actions-oidc-verifier.js";

export interface TestGitHubOidcSigningMaterial {
  readonly kid: string;
  readonly jwks: GitHubActionsOidcJwksPort;
  readonly sign: (claims: Record<string, unknown>) => Promise<string>;
}

export async function createTestGitHubActionsOidcSigner(): Promise<TestGitHubOidcSigningMaterial> {
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

  const publicJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as Record<
    string,
    unknown
  >;
  const kid = "test-github-oidc-key";
  const jwk = { ...publicJwk, kid, alg: "RS256", use: "sig" };
  const imported = await importRs256PublicKeyFromJwk(jwk);
  if (imported === null) {
    throw new Error("Failed to import test GitHub OIDC public key");
  }

  const keys: JwkPublicKey[] = [imported];

  return {
    kid,
    jwks: {
      getVerificationKeys() {
        return Promise.resolve(keys);
      },
    },
    async sign(claims) {
      const header = bytesToBase64Url(
        new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT", kid })),
      );
      const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
      const signingInput = `${header}.${body}`;
      const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        keyPair.privateKey,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
    },
  };
}

export function buildGitHubActionsOidcClaims(input: {
  audience: string;
  repository: string;
  repositoryOwner: string;
  repositoryId: string;
  repositoryOwnerId: string;
  subject: string;
  environment?: string;
  expiresAtEpoch: number;
  issuedAtEpoch?: number;
}): Record<string, unknown> {
  return {
    iss: GITHUB_ACTIONS_OIDC_ISSUER,
    sub: input.subject,
    aud: input.audience,
    exp: input.expiresAtEpoch,
    iat: input.issuedAtEpoch ?? input.expiresAtEpoch - 300,
    repository: input.repository,
    repository_owner: input.repositoryOwner,
    repository_id: input.repositoryId,
    repository_owner_id: input.repositoryOwnerId,
    ...(input.environment !== undefined ? { environment: input.environment } : {}),
  };
}
