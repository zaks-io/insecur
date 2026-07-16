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
import { checkSecretPossession, writeSecretByVariableKey } from "./http-client-secrets-write.js";
import { sessionWhoami } from "./http-client-whoami.js";
import { deriveAgentSession, registerAgentSession } from "./http-client-agent-session.js";
import type { HttpClientOptions } from "./http-client-envelope.js";
import type { ApiClient } from "./types.js";
import { parseApiHost } from "../config/api-host.js";

type HttpSessionApi = Pick<
  ApiClient,
  | "createCliAuthorizationUrl"
  | "exchangeCliPkceSession"
  | "startCliDeviceAuthorization"
  | "pollCliDeviceToken"
  | "provisionPersonalOrganization"
  | "writeSecretByVariableKey"
  | "checkSecretPossession"
  | "listEnvironmentSecrets"
  | "listSecretVersions"
  | "issueInjectionGrant"
  | "consumeInjectionGrant"
  | "consumeInjectionGrantAll"
  | "recordInjectionRunCompleted"
  | "listSessionOrganizations"
  | "listProjects"
  | "createProject"
  | "listEnvironments"
  | "listProjectSecrets"
  | "createEnvironment"
  | "listAuditEvents"
  | "exportTenantAudit"
  | "getOperation"
  | "cancelOperation"
  | "revokeCliSession"
>;

type HttpManagementApi = Omit<ApiClient, keyof HttpSessionApi>;

function requestHost(input: { readonly host: string }): string {
  return parseApiHost(input.host);
}

function createHttpSessionApi(base: string, options: HttpClientOptions): HttpSessionApi {
  return {
    createCliAuthorizationUrl: (input) => createCliAuthorizationUrl(base, input),
    exchangeCliPkceSession: (input) => exchangeCliPkceSession(requestHost(input), input, options),
    startCliDeviceAuthorization: (input) =>
      startCliDeviceAuthorization(requestHost(input), input, options),
    pollCliDeviceToken: (input) => pollCliDeviceToken(requestHost(input), input, options),
    provisionPersonalOrganization: (input) =>
      provisionPersonalOrganization(requestHost(input), input, options),
    writeSecretByVariableKey: (input) =>
      writeSecretByVariableKey(requestHost(input), input, options),
    checkSecretPossession: (input) => checkSecretPossession(requestHost(input), input, options),
    listEnvironmentSecrets: (input) => listEnvironmentSecrets(requestHost(input), input, options),
    listSecretVersions: (input) => listSecretVersions(requestHost(input), input, options),
    issueInjectionGrant: (input) => issueInjectionGrant(requestHost(input), input, options),
    consumeInjectionGrant: (input) => consumeInjectionGrant(requestHost(input), input, options),
    consumeInjectionGrantAll: (input) =>
      consumeInjectionGrantAll(requestHost(input), input, options),
    recordInjectionRunCompleted: (input) =>
      recordInjectionRunCompleted(requestHost(input), input, options),
    listSessionOrganizations: (input) =>
      listSessionOrganizations(requestHost(input), input, options),
    listProjects: (input) => listProjects(requestHost(input), input, options),
    createProject: (input) => createProject(requestHost(input), input, options),
    listEnvironments: (input) => listEnvironments(requestHost(input), input, options),
    listProjectSecrets: (input) => listProjectSecrets(requestHost(input), input, options),
    createEnvironment: (input) => createEnvironment(requestHost(input), input, options),
    listAuditEvents: (input) => listAuditEvents(requestHost(input), input, options),
    exportTenantAudit: (input) => exportTenantAudit(requestHost(input), input, options),
    getOperation: (input) => getOperation(requestHost(input), input, options),
    cancelOperation: (input) => cancelOperation(requestHost(input), input, options),
    revokeCliSession: (input) => revokeCliSession(requestHost(input), input, options),
  };
}

function createHttpManagementApi(options: HttpClientOptions): HttpManagementApi {
  return {
    createRuntimeInjectionPolicy: (input) =>
      createRuntimeInjectionPolicy(requestHost(input), input, options),
    getRuntimeInjectionPolicy: (input) =>
      getRuntimeInjectionPolicy(requestHost(input), input, options),
    disableRuntimeInjectionPolicy: (input) =>
      disableRuntimeInjectionPolicy(requestHost(input), input, options),
    requestProtectedPromotion: (input) =>
      requestProtectedPromotion(requestHost(input), input, options),
    requestProtectedRollback: (input) =>
      requestProtectedRollback(requestHost(input), input, options),
    listEnvironmentApprovals: (input) =>
      listEnvironmentApprovals(requestHost(input), input, options),
    listAppConnections: (input) => listAppConnections(requestHost(input), input, options),
    getAppConnectionStatus: (input) => getAppConnectionStatus(requestHost(input), input, options),
    createAppConnection: (input) => createAppConnection(requestHost(input), input, options),
    rotateAppConnectionCredential: (input) =>
      rotateAppConnectionCredential(requestHost(input), input, options),
    reauthAppConnection: (input) => reauthAppConnection(requestHost(input), input, options),
    disconnectAppConnection: (input) => disconnectAppConnection(requestHost(input), input, options),
    sessionWhoami: (input) => sessionWhoami(requestHost(input), input, options),
    deriveAgentSession: (input) => deriveAgentSession(requestHost(input), input, options),
    registerAgentSession: (input) => registerAgentSession(requestHost(input), input, options),
  };
}

export function createHttpApiClientForHost(
  host: string,
  options: HttpClientOptions = {},
): ApiClient {
  const validatedHost = parseApiHost(host);
  const base = validatedHost.endsWith("/") ? validatedHost.slice(0, -1) : validatedHost;
  return { ...createHttpSessionApi(base, options), ...createHttpManagementApi(options) };
}
