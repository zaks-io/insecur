import { listAuditEvents } from "./http-client-audit-events.js";
import { exportTenantAudit } from "./http-client-audit-export.js";
import {
  createAppConnection,
  disconnectAppConnection,
  getAppConnectionStatus,
  listAppConnections,
  reauthAppConnection,
  rotateAppConnectionCredential,
} from "./http-client-connections.js";
import {
  createCliAuthorizationUrl,
  exchangeCliPkceSession,
  pollCliDeviceToken,
  startCliDeviceAuthorization,
} from "./http-client-auth.js";
import { revokeCliSession } from "./http-client-logout.js";
import {
  createEnvironment,
  createProject,
  listEnvironments,
  listProjectSecrets,
  listProjects,
  listSessionOrganizations,
} from "./http-client-navigation.js";
import { cancelOperation, getOperation } from "./http-client-operations.js";
import { provisionPersonalOrganization } from "./http-client-onboarding.js";
import {
  consumeInjectionGrant,
  consumeInjectionGrantAll,
  issueInjectionGrant,
  recordInjectionRunCompleted,
} from "./http-client-runtime-injection.js";
import {
  createRuntimeInjectionPolicy,
  disableRuntimeInjectionPolicy,
  getRuntimeInjectionPolicy,
} from "./http-client-run-policies.js";
import {
  listEnvironmentApprovals,
  requestProtectedPromotion,
  requestProtectedRollback,
} from "./http-client-protected-change.js";
import { listEnvironmentSecrets, listSecretVersions } from "./http-client-secrets-read.js";
import { writeSecretByVariableKey } from "./http-client-secrets-write.js";
import { sessionWhoami } from "./http-client-whoami.js";
import { deriveAgentSession, registerAgentSession } from "./http-client-agent-session.js";
import type { HttpClientOptions } from "./http-client-envelope.js";
import type { ApiClient } from "./types.js";

export function createHttpApiClientForHost(
  host: string,
  options: HttpClientOptions = {},
): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(base, input, options),
    startCliDeviceAuthorization: () => startCliDeviceAuthorization(base, options),
    pollCliDeviceToken: (input) => pollCliDeviceToken(base, input, options),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input, options),
    writeSecretByVariableKey: (input) => writeSecretByVariableKey(base, input, options),
    listEnvironmentSecrets: (input) => listEnvironmentSecrets(base, input, options),
    listSecretVersions: (input) => listSecretVersions(base, input, options),
    issueInjectionGrant: (input) => issueInjectionGrant(base, input, options),
    consumeInjectionGrant: (input) => consumeInjectionGrant(base, input, options),
    consumeInjectionGrantAll: (input) => consumeInjectionGrantAll(base, input, options),
    recordInjectionRunCompleted: (input) => recordInjectionRunCompleted(base, input, options),
    listSessionOrganizations: (input) => listSessionOrganizations(base, input, options),
    listProjects: (input) => listProjects(base, input, options),
    createProject: (input) => createProject(base, input, options),
    listEnvironments: (input) => listEnvironments(base, input, options),
    listProjectSecrets: (input) => listProjectSecrets(base, input, options),
    createEnvironment: (input) => createEnvironment(base, input, options),
    listAuditEvents: (input) => listAuditEvents(base, input, options),
    exportTenantAudit: (input) => exportTenantAudit(base, input, options),
    getOperation: (input) => getOperation(base, input, options),
    cancelOperation: (input) => cancelOperation(base, input, options),
    revokeCliSession: (input) => revokeCliSession(base, input, options),
    createRuntimeInjectionPolicy: (input) => createRuntimeInjectionPolicy(base, input, options),
    getRuntimeInjectionPolicy: (input) => getRuntimeInjectionPolicy(base, input, options),
    disableRuntimeInjectionPolicy: (input) => disableRuntimeInjectionPolicy(base, input, options),
    requestProtectedPromotion: (input) => requestProtectedPromotion(base, input, options),
    requestProtectedRollback: (input) => requestProtectedRollback(base, input, options),
    listEnvironmentApprovals: (input) => listEnvironmentApprovals(base, input, options),
    listAppConnections: (input) => listAppConnections(base, input, options),
    getAppConnectionStatus: (input) => getAppConnectionStatus(base, input, options),
    createAppConnection: (input) => createAppConnection(base, input, options),
    rotateAppConnectionCredential: (input) => rotateAppConnectionCredential(base, input, options),
    reauthAppConnection: (input) => reauthAppConnection(base, input, options),
    disconnectAppConnection: (input) => disconnectAppConnection(base, input, options),
    sessionWhoami: (input) => sessionWhoami(base, input, options),
    deriveAgentSession: (input) => deriveAgentSession(base, input, options),
    registerAgentSession: (input) => registerAgentSession(base, input, options),
  };
}
