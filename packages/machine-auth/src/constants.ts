/** GitHub Actions OIDC issuer (ADR-0004). */
export const GITHUB_ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export const GITHUB_ACTIONS_OIDC_JWKS_URL =
  "https://token.actions.githubusercontent.com/.well-known/jwks";

/** Default machine access token lifetime (15 minutes). */
export const MACHINE_ACCESS_TOKEN_TTL_SECONDS = 900;

export const MACHINE_ACCESS_TOKEN_TYP = "insecur_machine_access_v1";
