export const MACHINE_ACCESS_AUDIT_EVENT_CODES = {
  machineGithubActionsOidcExchanged: "machine_auth.github_actions_oidc_exchanged",
  machineGithubActionsOidcExchangeDenied: "machine_auth.github_actions_oidc_exchange_denied",
  machineDeployKeyExchanged: "machine_auth.deploy_key_exchanged",
  machineDeployKeyExchangeDenied: "machine_auth.deploy_key_exchange_denied",
  machineAuthAccessTokenMinted: "machine_auth.access_token_minted",
  machineAuthAccessTokenUsed: "machine_auth.access_token_used",
  machineAuthAccessTokenDenied: "machine_auth.access_token_denied",
  machineAuthAuthorizationDenied: "machine_auth.authorization_denied",
} as const;
