import type { AuthenticatedRuntimeClient, ClientMethod } from "./runtime-client-types.js";

type PostAuthMethodName = keyof AuthenticatedRuntimeClient;

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
    consumeGrant: forward("consumeGrant"),
    consumeGrantAll: forward("consumeGrantAll"),
    recordInjectionRunCompleted: forward("recordInjectionRunCompleted"),
    captureFirstValueFeedback: forward("captureFirstValueFeedback"),
    listProjects: forward("listProjects"),
    createProject: forward("createProject"),
    listEnvironments: forward("listEnvironments"),
    createEnvironment: forward("createEnvironment"),
    listProjectSecrets: forward("listProjectSecrets"),
    listSessionOrganizations: forward("listSessionOrganizations"),
    revokeCliSession: forward("revokeCliSession"),
    listOrganizationMembers: forward("listOrganizationMembers"),
    listOrganizationInvitations: forward("listOrganizationInvitations"),
    listAuditEvents: forward("listAuditEvents"),
    listPendingHighAssuranceChallenges: forward("listPendingHighAssuranceChallenges"),
    getHighAssuranceChallenge: forward("getHighAssuranceChallenge"),
    clearHighAssuranceChallenge: forward("clearHighAssuranceChallenge"),
    denyHighAssuranceChallenge: forward("denyHighAssuranceChallenge"),
    createRuntimeInjectionPolicy: forward("createRuntimeInjectionPolicy"),
    getRuntimeInjectionPolicy: forward("getRuntimeInjectionPolicy"),
    disableRuntimeInjectionPolicy: forward("disableRuntimeInjectionPolicy"),
  };
}
