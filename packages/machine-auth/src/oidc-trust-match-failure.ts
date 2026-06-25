import { AUTH_ERROR_CODES, type AuthErrorCode } from "@insecur/domain";
import type { GitHubActionsOidcAuthMethodRow } from "./github-actions-oidc-auth-method-row.js";
import type { OidcTrustMatchFailureReason } from "./match-github-actions-oidc-trust.js";

export function oidcTrustFailureReasonCode(reason: OidcTrustMatchFailureReason): AuthErrorCode {
  switch (reason) {
    case "expired":
      return AUTH_ERROR_CODES.expired;
    case "invalid":
      return AUTH_ERROR_CODES.invalid;
    case "wrong_audience":
      return AUTH_ERROR_CODES.oidcWrongAudience;
    case "wrong_repository":
      return AUTH_ERROR_CODES.oidcWrongRepository;
    case "wrong_environment":
      return AUTH_ERROR_CODES.oidcWrongEnvironment;
    case "untrusted_source":
      return AUTH_ERROR_CODES.oidcUntrustedSource;
  }
}

export function oidcTrustMatchFailure(
  reason: OidcTrustMatchFailureReason,
  authMethod?: GitHubActionsOidcAuthMethodRow,
) {
  return {
    ok: false as const,
    reason,
    reasonCode: oidcTrustFailureReasonCode(reason),
    ...(authMethod !== undefined ? { authMethod } : {}),
  };
}
