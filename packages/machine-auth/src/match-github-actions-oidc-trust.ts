import type { AuthErrorCode } from "@insecur/domain";
import {
  audienceMatches,
  assertGitHubActionsIssuer,
  normalizeGitHubRepository,
  type GitHubActionsOidcClaims,
} from "./github-actions-oidc-claims.js";
import type { GitHubActionsOidcAuthMethodRow } from "./github-actions-oidc-auth-method-row.js";
import { oidcTrustMatchFailure } from "./oidc-trust-match-failure.js";

export type OidcTrustMatchFailureReason =
  | "expired"
  | "invalid"
  | "wrong_audience"
  | "wrong_repository"
  | "wrong_environment"
  | "untrusted_source";

export interface OidcTrustMatchSuccess {
  readonly ok: true;
  readonly authMethod: GitHubActionsOidcAuthMethodRow;
}

export interface OidcTrustMatchFailure {
  readonly ok: false;
  readonly reason: OidcTrustMatchFailureReason;
  readonly reasonCode: AuthErrorCode;
  readonly authMethod?: GitHubActionsOidcAuthMethodRow;
}

export type OidcTrustMatchResult = OidcTrustMatchSuccess | OidcTrustMatchFailure;

export { oidcTrustFailureReasonCode } from "./oidc-trust-match-failure.js";

function repositoryMatches(
  claims: GitHubActionsOidcClaims,
  authMethod: GitHubActionsOidcAuthMethodRow,
): boolean {
  return (
    normalizeGitHubRepository(claims.repository) ===
    normalizeGitHubRepository(authMethod.githubRepository)
  );
}

function environmentMatches(
  claims: GitHubActionsOidcClaims,
  authMethod: GitHubActionsOidcAuthMethodRow,
): boolean {
  if (authMethod.githubEnvironment === null) {
    return claims.environment === undefined;
  }
  return claims.environment === authMethod.githubEnvironment;
}

function matchUniqueAuthMethod(
  methods: readonly GitHubActionsOidcAuthMethodRow[],
): OidcTrustMatchResult {
  if (methods.length !== 1) {
    return oidcTrustMatchFailure("untrusted_source");
  }
  const authMethod = methods[0];
  if (authMethod === undefined) {
    return oidcTrustMatchFailure("untrusted_source");
  }
  return { ok: true, authMethod };
}

/**
 * Matches verified GitHub Actions OIDC claims to one tenant-qualified auth method.
 * Fails closed when issuer, expiry, audience, repository, or environment do not align.
 */
export function matchGitHubActionsOidcTrust(
  claims: GitHubActionsOidcClaims,
  authMethods: readonly GitHubActionsOidcAuthMethodRow[],
  nowEpoch: number,
): OidcTrustMatchResult {
  if (!assertGitHubActionsIssuer(claims.issuer)) {
    return oidcTrustMatchFailure("invalid");
  }
  if (claims.expiresAtEpoch <= nowEpoch) {
    return oidcTrustMatchFailure("expired");
  }

  const audienceMatchesByMethod = authMethods.filter((method) =>
    audienceMatches(claims.audience, method.oidcAudience),
  );
  if (audienceMatchesByMethod.length === 0) {
    return oidcTrustMatchFailure("wrong_audience");
  }

  const repositoryMatchesByMethod = audienceMatchesByMethod.filter((method) =>
    repositoryMatches(claims, method),
  );
  if (repositoryMatchesByMethod.length === 0) {
    return oidcTrustMatchFailure("wrong_repository");
  }

  const environmentMatchesByMethod = repositoryMatchesByMethod.filter((method) =>
    environmentMatches(claims, method),
  );
  if (environmentMatchesByMethod.length === 0) {
    return oidcTrustMatchFailure("wrong_environment", repositoryMatchesByMethod[0]);
  }

  return matchUniqueAuthMethod(environmentMatchesByMethod);
}
