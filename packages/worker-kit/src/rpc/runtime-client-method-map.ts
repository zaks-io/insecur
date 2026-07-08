import type { AuthenticatedRuntimeClient, ClientMethod } from "./runtime-client-types.js";

type PostAuthMethodName = keyof AuthenticatedRuntimeClient;

function forwardConnectionMethods(
  forward: <K extends PostAuthMethodName>(method: K) => ClientMethod<K>,
) {
  return {
    listAppConnections: forward("listAppConnections"),
    getAppConnectionStatus: forward("getAppConnectionStatus"),
    createAppConnection: forward("createAppConnection"),
    rotateAppConnectionCredential: forward("rotateAppConnectionCredential"),
    reauthAppConnection: forward("reauthAppConnection"),
    disconnectAppConnection: forward("disconnectAppConnection"),
  };
}

function forwardProjectAccessMethods(
  forward: <K extends PostAuthMethodName>(method: K) => ClientMethod<K>,
) {
  return {
    listProjectMachineIdentities: forward("listProjectMachineIdentities"),
    listProjectInjectionGrants: forward("listProjectInjectionGrants"),
  };
}

function forwardProtectedChangeMethods(
  forward: <K extends PostAuthMethodName>(method: K) => ClientMethod<K>,
) {
  return {
    requestProtectedPromotion: forward("requestProtectedPromotion"),
    requestProtectedRollback: forward("requestProtectedRollback"),
    listEnvironmentApprovals: forward("listEnvironmentApprovals"),
    listPendingApprovalRequests: forward("listPendingApprovalRequests"),
    getApprovalRequestReview: forward("getApprovalRequestReview"),
    approveApprovalRequest: forward("approveApprovalRequest"),
    rejectApprovalRequest: forward("rejectApprovalRequest"),
    cancelApprovalRequest: forward("cancelApprovalRequest"),
  };
}

function forwardHighAssuranceMethods(
  forward: <K extends PostAuthMethodName>(method: K) => ClientMethod<K>,
) {
  return {
    listPendingHighAssuranceChallenges: forward("listPendingHighAssuranceChallenges"),
    getHighAssuranceChallenge: forward("getHighAssuranceChallenge"),
    clearHighAssuranceChallenge: forward("clearHighAssuranceChallenge"),
    denyHighAssuranceChallenge: forward("denyHighAssuranceChallenge"),
  };
}

export function buildAuthenticatedRuntimeClientMethods(
  forward: <K extends PostAuthMethodName>(method: K) => ClientMethod<K>,
): AuthenticatedRuntimeClient {
  return {
    provisionGuidedOrganization: forward("provisionGuidedOrganization"),
    createOperatorOrganization: forward("createOperatorOrganization"),
    createInvitation: forward("createInvitation"),
    acceptInvitation: forward("acceptInvitation"),
    getOperation: forward("getOperation"),
    cancelOperation: forward("cancelOperation"),
    issueInjectionGrant: forward("issueInjectionGrant"),
    completeBootstrapOperatorClaim: forward("completeBootstrapOperatorClaim"),
    writeSecret: forward("writeSecret"),
    checkSecretPossession: forward("checkSecretPossession"),
    consumeGrant: forward("consumeGrant"),
    consumeGrantAll: forward("consumeGrantAll"),
    recordInjectionRunCompleted: forward("recordInjectionRunCompleted"),
    captureFirstValueFeedback: forward("captureFirstValueFeedback"),
    listProjects: forward("listProjects"),
    createProject: forward("createProject"),
    listEnvironments: forward("listEnvironments"),
    createEnvironment: forward("createEnvironment"),
    listProjectSecrets: forward("listProjectSecrets"),
    ...forwardProjectAccessMethods(forward),
    listEnvironmentSecrets: forward("listEnvironmentSecrets"),
    listSecretVersions: forward("listSecretVersions"),
    listSessionOrganizations: forward("listSessionOrganizations"),
    revokeCliSession: forward("revokeCliSession"),
    resolveSessionWhoami: forward("resolveSessionWhoami"),
    registerAgentSession: forward("registerAgentSession"),
    listOrganizationMembers: forward("listOrganizationMembers"),
    listOrganizationInvitations: forward("listOrganizationInvitations"),
    listAuditEvents: forward("listAuditEvents"),
    exportTenantAudit: forward("exportTenantAudit"),
    queryFirstValueUsage: forward("queryFirstValueUsage"),
    ...forwardHighAssuranceMethods(forward),
    createRuntimeInjectionPolicy: forward("createRuntimeInjectionPolicy"),
    getRuntimeInjectionPolicy: forward("getRuntimeInjectionPolicy"),
    disableRuntimeInjectionPolicy: forward("disableRuntimeInjectionPolicy"),
    ...forwardProtectedChangeMethods(forward),
    createWebhookSubscription: forward("createWebhookSubscription"),
    listWebhookSubscriptions: forward("listWebhookSubscriptions"),
    updateWebhookSubscription: forward("updateWebhookSubscription"),
    deleteWebhookSubscription: forward("deleteWebhookSubscription"),
    rotateWebhookSigningSecret: forward("rotateWebhookSigningSecret"),
    listWebhookEventCodes: forward("listWebhookEventCodes"),
    ...forwardConnectionMethods(forward),
  };
}
