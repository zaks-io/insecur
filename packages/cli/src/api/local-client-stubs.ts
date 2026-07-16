import { errorEnvelope, LOCAL_ERROR_CODES } from "@insecur/domain";

const LOCAL_CLOUD_REMEDIATION = {
  login: ["insecur", "login"],
  migrate: ["insecur", "projects", "migrate", "--confirm-migrate"],
} as const;

export function unsupportedLocalApi(capability: string) {
  return () =>
    Promise.resolve({
      ok: false as const,
      envelope: errorEnvelope(
        {
          code: LOCAL_ERROR_CODES.cloudFeatureUnavailable,
          message: `${capability} is not available in Local Mode. Run insecur login, migrate this project, then retry the hosted command.`,
          retryable: false,
        },
        { remediation: LOCAL_CLOUD_REMEDIATION },
      ),
      httpStatus: 403,
    });
}

const HOSTED_NAVIGATION_STUBS = {
  exchangeCliPkceSession: unsupportedLocalApi("Hosted login (PKCE exchange)"),
  startCliDeviceAuthorization: unsupportedLocalApi("Hosted device login"),
  pollCliDeviceToken: unsupportedLocalApi("Hosted device login polling"),
  provisionPersonalOrganization: unsupportedLocalApi("Hosted organization provisioning"),
  listEnvironmentSecrets: unsupportedLocalApi("Hosted secret listing"),
  checkSecretPossession: unsupportedLocalApi("Hosted possession check"),
  listSecretVersions: unsupportedLocalApi("Hosted secret version listing"),
  consumeInjectionGrantAll: unsupportedLocalApi("Profile-backed injection of all variables"),
  listSessionOrganizations: unsupportedLocalApi("Organization listing"),
  listProjects: unsupportedLocalApi("Project listing"),
  createProject: unsupportedLocalApi("Project creation"),
  listEnvironments: unsupportedLocalApi("Environment listing"),
  listProjectSecrets: unsupportedLocalApi("Project-wide secret listing"),
  createEnvironment: unsupportedLocalApi("Environment creation"),
} as const;

const HOSTED_ADMIN_STUBS = {
  listAuditEvents: unsupportedLocalApi("Audit tail"),
  exportTenantAudit: unsupportedLocalApi("Audit export"),
  getOperation: unsupportedLocalApi("Operation status"),
  cancelOperation: unsupportedLocalApi("Operation cancel"),
  revokeCliSession: unsupportedLocalApi("Hosted session revocation"),
  createRuntimeInjectionPolicy: unsupportedLocalApi("Run policy creation"),
  getRuntimeInjectionPolicy: unsupportedLocalApi("Run policy show"),
  disableRuntimeInjectionPolicy: unsupportedLocalApi("Run policy disable"),
  requestProtectedPromotion: unsupportedLocalApi("Secret promotion"),
  requestProtectedRollback: unsupportedLocalApi("Secret rollback"),
  listEnvironmentApprovals: unsupportedLocalApi("Approvals listing"),
  listAppConnections: unsupportedLocalApi("App Connection listing"),
  getAppConnectionStatus: unsupportedLocalApi("App Connection status"),
  createAppConnection: unsupportedLocalApi("App Connection creation"),
  rotateAppConnectionCredential: unsupportedLocalApi("App Connection credential rotation"),
  reauthAppConnection: unsupportedLocalApi("App Connection re-auth"),
  disconnectAppConnection: unsupportedLocalApi("App Connection disconnect"),
  sessionWhoami: unsupportedLocalApi("Hosted session whoami"),
  deriveAgentSession: unsupportedLocalApi("Agent session derivation"),
  registerAgentSession: unsupportedLocalApi("Agent session registration"),
} as const;

export function createUnsupportedLocalApiMethods() {
  return {
    ...HOSTED_NAVIGATION_STUBS,
    ...HOSTED_ADMIN_STUBS,
  };
}
