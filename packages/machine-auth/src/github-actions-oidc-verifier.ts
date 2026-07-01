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
  | { ok: false; reason: "malformed" | "invalid" | "expired" };

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

function readNotBeforeEpoch(payload: Record<string, unknown>): number | null {
  const nbf = payload.nbf;
  return typeof nbf === "number" && Number.isFinite(nbf) ? Math.floor(nbf) : null;
}

type OidcTokenTimingFailure = "invalid" | "expired";

function timingFailureReason(
  payload: Record<string, unknown>,
  claims: GitHubActionsOidcClaims,
  nowEpoch: number,
): OidcTokenTimingFailure | null {
  const notBeforeEpoch = readNotBeforeEpoch(payload);
  if (notBeforeEpoch !== null && notBeforeEpoch > nowEpoch) {
    return "invalid";
  }
  if (claims.expiresAtEpoch <= nowEpoch) {
    return "expired";
  }
  return null;
}

/**
 * Verifies a GitHub Actions OIDC JWT and extracts metadata-safe claims.
 */
export async function verifyGitHubActionsOidcToken(
  token: string,
  jwks: GitHubActionsOidcJwksPort,
  nowEpoch?: number,
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

  const now = nowEpoch ?? Math.floor(Date.now() / 1000);
  const timingFailure = timingFailureReason(verified.payload, claims, now);
  if (timingFailure !== null) {
    return { ok: false, reason: timingFailure };
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
