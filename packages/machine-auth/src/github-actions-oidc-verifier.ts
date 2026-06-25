import {
  parseGitHubActionsOidcClaims,
  type GitHubActionsOidcClaims,
} from "./github-actions-oidc-claims.js";
import {
  importRs256PublicKeyFromJwk,
  verifyRs256Jwt,
  type JwkPublicKey,
  type VerifyRs256JwtResult,
} from "./rs256-jwt.js";

export type VerifyGitHubActionsOidcTokenResult =
  | { ok: true; claims: GitHubActionsOidcClaims }
  | { ok: false; reason: "malformed" | "invalid" };

export interface GitHubActionsOidcJwksPort {
  getVerificationKeys(): Promise<readonly JwkPublicKey[]>;
}

function verificationFailure(
  verifyResult: VerifyRs256JwtResult,
): VerifyGitHubActionsOidcTokenResult {
  if (verifyResult.ok) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: verifyResult.reason === "malformed" ? "malformed" : "invalid" };
}

/**
 * Verifies a GitHub Actions OIDC JWT and extracts metadata-safe claims.
 */
export async function verifyGitHubActionsOidcToken(
  token: string,
  jwks: GitHubActionsOidcJwksPort,
): Promise<VerifyGitHubActionsOidcTokenResult> {
  const keys = await jwks.getVerificationKeys();
  if (keys.length === 0) {
    return { ok: false, reason: "invalid" };
  }

  const verified = await verifyRs256Jwt(token, keys);
  if (!verified.ok) {
    return verificationFailure(verified);
  }

  const claims = parseGitHubActionsOidcClaims(verified.payload);
  if (claims === null) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, claims };
}

export interface GitHubActionsOidcJwksDocument {
  readonly keys: readonly Record<string, unknown>[];
}

export async function jwkPublicKeysFromDocument(
  document: GitHubActionsOidcJwksDocument,
): Promise<readonly JwkPublicKey[]> {
  const keys: JwkPublicKey[] = [];
  for (const jwk of document.keys) {
    const imported = await importRs256PublicKeyFromJwk(jwk);
    if (imported !== null) {
      keys.push(imported);
    }
  }
  return keys;
}
