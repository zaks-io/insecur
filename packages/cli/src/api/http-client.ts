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
import { createCliAuthorizationUrl, exchangeCliPkceSession } from "./http-client-auth.js";
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
import type { ApiClient } from "./types.js";

export function createHttpApiClientForHost(host: string): ApiClient {
  const base = host.endsWith("/") ? host.slice(0, -1) : host;
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(base, input),
    provisionPersonalOrganization: (input) => provisionPersonalOrganization(base, input),
    writeSecretByVariableKey: (input) => writeSecretByVariableKey(base, input),
    listEnvironmentSecrets: (input) => listEnvironmentSecrets(base, input),
    listSecretVersions: (input) => listSecretVersions(base, input),
    issueInjectionGrant: (input) => issueInjectionGrant(base, input),
    consumeInjectionGrant: (input) => consumeInjectionGrant(base, input),
    consumeInjectionGrantAll: (input) => consumeInjectionGrantAll(base, input),
    recordInjectionRunCompleted: (input) => recordInjectionRunCompleted(base, input),
    listSessionOrganizations: (input) => listSessionOrganizations(base, input),
    listProjects: (input) => listProjects(base, input),
    createProject: (input) => createProject(base, input),
    listEnvironments: (input) => listEnvironments(base, input),
    listProjectSecrets: (input) => listProjectSecrets(base, input),
    createEnvironment: (input) => createEnvironment(base, input),
    listAuditEvents: (input) => listAuditEvents(base, input),
    exportTenantAudit: (input) => exportTenantAudit(base, input),
    getOperation: (input) => getOperation(base, input),
    cancelOperation: (input) => cancelOperation(base, input),
    revokeCliSession: (input) => revokeCliSession(base, input),
    createRuntimeInjectionPolicy: (input) => createRuntimeInjectionPolicy(base, input),
    getRuntimeInjectionPolicy: (input) => getRuntimeInjectionPolicy(base, input),
    disableRuntimeInjectionPolicy: (input) => disableRuntimeInjectionPolicy(base, input),
    requestProtectedPromotion: (input) => requestProtectedPromotion(base, input),
    requestProtectedRollback: (input) => requestProtectedRollback(base, input),
    listEnvironmentApprovals: (input) => listEnvironmentApprovals(base, input),
    listAppConnections: (input) => listAppConnections(base, input),
    getAppConnectionStatus: (input) => getAppConnectionStatus(base, input),
    createAppConnection: (input) => createAppConnection(base, input),
    rotateAppConnectionCredential: (input) => rotateAppConnectionCredential(base, input),
    reauthAppConnection: (input) => reauthAppConnection(base, input),
    disconnectAppConnection: (input) => disconnectAppConnection(base, input),
    sessionWhoami: (input) => sessionWhoami(base, input),
    deriveAgentSession: (input) => deriveAgentSession(base, input),
    registerAgentSession: (input) => registerAgentSession(base, input),
  };
}
