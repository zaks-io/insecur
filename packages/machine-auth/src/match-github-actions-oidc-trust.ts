import type { AuthErrorCode } from "@insecur/domain";
import {
  audienceMatches,
  assertGitHubActionsIssuer,
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

interface OidcTrustMatchSuccess {
  readonly ok: true;
  readonly authMethod: GitHubActionsOidcAuthMethodRow;
}

interface OidcTrustMatchFailure {
  readonly ok: false;
  readonly reason: OidcTrustMatchFailureReason;
  readonly reasonCode: AuthErrorCode;
  readonly authMethod?: GitHubActionsOidcAuthMethodRow;
}

export type OidcTrustMatchResult = OidcTrustMatchSuccess | OidcTrustMatchFailure;

export { oidcTrustFailureReasonCode } from "./oidc-trust-match-failure.js";

function repositoryIdentityMatches(
  claims: GitHubActionsOidcClaims,
  authMethod: GitHubActionsOidcAuthMethodRow,
): boolean {
  return (
    claims.repositoryId === authMethod.githubRepositoryId &&
    claims.repositoryOwnerId === authMethod.githubRepositoryOwnerId
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
 * Fails closed when issuer, expiry, audience, stable repository identity, or environment
 * do not align. Repository display names are not trusted because they can change on
 * rename, transfer, or recreation.
 *
 * Deferred: workflow/ref/subject constraints (`job_workflow_ref`, `ref`, immutable `sub`
 * patterns) are not enforced in this slice; see INS-273 follow-up.
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
    repositoryIdentityMatches(claims, method),
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
