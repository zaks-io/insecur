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
  exchangeCliPkceSession: unsupportedLocalApi("exchangeCliPkceSession"),
  provisionPersonalOrganization: unsupportedLocalApi("provisionPersonalOrganization"),
  listEnvironmentSecrets: unsupportedLocalApi("listEnvironmentSecrets"),
  listSecretVersions: unsupportedLocalApi("listSecretVersions"),
  consumeInjectionGrantAll: unsupportedLocalApi("consumeInjectionGrantAll"),
  listSessionOrganizations: unsupportedLocalApi("listSessionOrganizations"),
  listProjects: unsupportedLocalApi("listProjects"),
  createProject: unsupportedLocalApi("createProject"),
  listEnvironments: unsupportedLocalApi("listEnvironments"),
  listProjectSecrets: unsupportedLocalApi("listProjectSecrets"),
  createEnvironment: unsupportedLocalApi("createEnvironment"),
} as const;

const HOSTED_ADMIN_STUBS = {
  listAuditEvents: unsupportedLocalApi("listAuditEvents"),
  exportTenantAudit: unsupportedLocalApi("exportTenantAudit"),
  getOperation: unsupportedLocalApi("getOperation"),
  cancelOperation: unsupportedLocalApi("cancelOperation"),
  revokeCliSession: unsupportedLocalApi("revokeCliSession"),
  createRuntimeInjectionPolicy: unsupportedLocalApi("createRuntimeInjectionPolicy"),
  getRuntimeInjectionPolicy: unsupportedLocalApi("getRuntimeInjectionPolicy"),
  disableRuntimeInjectionPolicy: unsupportedLocalApi("disableRuntimeInjectionPolicy"),
  requestProtectedPromotion: unsupportedLocalApi("requestProtectedPromotion"),
  requestProtectedRollback: unsupportedLocalApi("requestProtectedRollback"),
  listEnvironmentApprovals: unsupportedLocalApi("listEnvironmentApprovals"),
  listAppConnections: unsupportedLocalApi("listAppConnections"),
  getAppConnectionStatus: unsupportedLocalApi("getAppConnectionStatus"),
  createAppConnection: unsupportedLocalApi("createAppConnection"),
  rotateAppConnectionCredential: unsupportedLocalApi("rotateAppConnectionCredential"),
  reauthAppConnection: unsupportedLocalApi("reauthAppConnection"),
  disconnectAppConnection: unsupportedLocalApi("disconnectAppConnection"),
  sessionWhoami: unsupportedLocalApi("sessionWhoami"),
  deriveAgentSession: unsupportedLocalApi("deriveAgentSession"),
  registerAgentSession: unsupportedLocalApi("registerAgentSession"),
} as const;

export function createUnsupportedLocalApiMethods() {
  return {
    ...HOSTED_NAVIGATION_STUBS,
    ...HOSTED_ADMIN_STUBS,
  };
}
