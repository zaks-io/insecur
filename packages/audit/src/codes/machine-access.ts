export const MACHINE_ACCESS_AUDIT_EVENT_CODES = {
  machineGithubActionsOidcExchanged: "machine_auth.github_actions_oidc_exchanged",
  machineGithubActionsOidcExchangeDenied: "machine_auth.github_actions_oidc_exchange_denied",
  machineDeployKeyExchanged: "machine_auth.deploy_key_exchanged",
  machineDeployKeyExchangeDenied: "machine_auth.deploy_key_exchange_denied",
} as const;
