import { GITHUB_ACTIONS_OIDC_ISSUER } from "./constants.js";

/** Metadata-safe GitHub Actions OIDC claims used for trusted source matching. */
export interface GitHubActionsOidcClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: readonly string[];
  readonly expiresAtEpoch: number;
  /** Display metadata only; trust matching uses stable repository identity claims. */
  readonly repository: string;
  readonly repositoryOwner: string;
  readonly repositoryId: string;
  readonly repositoryOwnerId: string;
  readonly environment?: string;
}

function normalizeAudience(aud: unknown): readonly string[] | null {
  if (typeof aud === "string") {
    return [aud];
  }
  if (!Array.isArray(aud)) {
    return null;
  }
  const audiences: string[] = [];
  for (const entry of aud) {
    if (typeof entry !== "string" || entry.length === 0) {
      return null;
    }
    audiences.push(entry);
  }
  return audiences.length > 0 ? audiences : null;
}

function readStringClaim(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** GitHub emits repository identity claims as numeric strings (sometimes numbers). */
function readStableRepositoryIdentityClaim(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }
  return null;
}

function readExpiryEpoch(payload: Record<string, unknown>): number | null {
  const exp = payload.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? Math.floor(exp) : null;
}

interface ParsedGitHubActionsOidcRequiredClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: readonly string[];
  readonly expiresAtEpoch: number;
  readonly repository: string;
  readonly repositoryOwner: string;
  readonly repositoryId: string;
  readonly repositoryOwnerId: string;
}

function readRequiredGitHubActionsOidcClaims(
  payload: Record<string, unknown>,
): ParsedGitHubActionsOidcRequiredClaims | null {
  const issuer = readStringClaim(payload, "iss");
  const subject = readStringClaim(payload, "sub");
  const audience = normalizeAudience(payload.aud);
  const expiresAtEpoch = readExpiryEpoch(payload);
  const repository = readStringClaim(payload, "repository");
  const repositoryOwner = readStringClaim(payload, "repository_owner");
  const repositoryId = readStableRepositoryIdentityClaim(payload, "repository_id");
  const repositoryOwnerId = readStableRepositoryIdentityClaim(payload, "repository_owner_id");

  const required = {
    issuer,
    subject,
    audience,
    expiresAtEpoch,
    repository,
    repositoryOwner,
    repositoryId,
    repositoryOwnerId,
  };
  if (Object.values(required).some((value) => value === null)) {
    return null;
  }

  return required as ParsedGitHubActionsOidcRequiredClaims;
}

/**
 * Parses verified JWT payload into trusted-source claims.
 * Returns null when required GitHub Actions claims are missing.
 */
export function parseGitHubActionsOidcClaims(
  payload: Record<string, unknown>,
): GitHubActionsOidcClaims | null {
  const required = readRequiredGitHubActionsOidcClaims(payload);
  if (required === null) {
    return null;
  }

  const environment = readStringClaim(payload, "environment");

  return {
    ...required,
    ...(environment !== null ? { environment } : {}),
  };
}

export function assertGitHubActionsIssuer(issuer: string): boolean {
  return issuer === GITHUB_ACTIONS_OIDC_ISSUER;
}

export function normalizeGitHubRepository(repository: string): string {
  return repository.trim().toLowerCase();
}

export function audienceMatches(
  tokenAudiences: readonly string[],
  expectedAudience: string,
): boolean {
  return tokenAudiences.includes(expectedAudience);
}
