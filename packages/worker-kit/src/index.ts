export { createRequestId, handleDeliveryRoute, handleRoute } from "./http/handle-route.js";
export {
  HTTP_STATUS_BY_CODE,
  domainErrorEnvelope,
  httpStatusForKnownErrorCode,
  knownErrorCodeFromUnknown,
  safePublicErrorMessage,
} from "./http/domain-error-response.js";
export {
  encodeRequestValueUtf8,
  parseEnvironmentIdParam,
  parseGrantIdParam,
  parseGuidedOrganizationResourceIds,
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  parseInvitationIdParam,
  parseJsonBody,
  parseOperationIdParam,
  parseRequestIdParam,
  parseOptionalDisplayName,
  parseRequiredDisplayName,
  parseOptionalInvitationId,
  parseOptionalMembershipId,
  parseOptionalSecretId,
  parseOperatorOrganizationResourceIds,
  parseOrganizationIdParam,
  parseOwnerMembershipId,
  parseProjectIdParam,
  parseUserIdField,
  parseVariableKeyField,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  readSecretValueField,
  requireRouteParam,
  type InjectionGrantConsumeSelectorInput,
  type InjectionGrantIssueSelectorInput,
} from "./http/parse-route-input.js";
export { toAccessActor, toAuditActor } from "./http/request-actor.js";

export type {
  AcceptInvitationRpcInput,
  CompleteBootstrapClaimRpcInput,
  ConsumeGrantAllRpcInput,
  ConsumeGrantRpcInput,
  CreateInvitationRpcInput,
  CreateOperatorOrganizationRpcInput,
  GetBootstrapStatusRpcInput,
  GetOperationRpcInput,
  IssueInjectionGrantRpcInput,
  ProvisionGuidedOrganizationRpcInput,
  RecordAdmissionDeniedRpcInput,
  RecordAdmissionDeniedRpcPayload,
  RecordAbuseDeniedRpcInput,
  RecordAbuseDeniedRpcPayload,
  ResolveAdmissionRpcInput,
  ResolveAdmissionRpcPayload,
  RuntimeGeneratedSecretInput,
  RuntimeRpc,
  RuntimeRpcError,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "./rpc/runtime-rpc-contract.js";
export type {
  AuditEventActorRead,
  AuditEventRead,
  AuditEventResourceRead,
  ListAuditEventsFiltersRpcInput,
  ListAuditEventsRpcInput,
  ListAuditEventsRpcPayload,
} from "./rpc/runtime-audit-rpc-contract.js";
export type {
  CreateEnvironmentRpcInput,
  CreateEnvironmentRpcPayload,
  CreateProjectRpcInput,
  CreateProjectRpcPayload,
  EnvironmentMetadataRead,
  ListEnvironmentsRpcInput,
  ListEnvironmentsRpcPayload,
  ListOrganizationInvitationsRpcInput,
  ListOrganizationInvitationsRpcPayload,
  ListOrganizationMembersRpcInput,
  ListOrganizationMembersRpcPayload,
  ListProjectSecretsRpcInput,
  ListProjectSecretsRpcPayload,
  ListProjectsRpcInput,
  ListProjectsRpcPayload,
  ListSessionOrganizationsRpcInput,
  ListSessionOrganizationsRpcPayload,
  OrganizationInvitationRead,
  OrganizationMemberRead,
  ProjectMetadataRead,
  SecretMatrixCellRead,
  SecretMatrixLastSetActorRead,
  SecretMatrixRowRead,
  SessionOrganizationRead,
} from "./rpc/runtime-metadata-rpc-contract.js";
export type {
  CaptureFirstValueFeedbackRpcInput,
  CaptureFirstValueFeedbackRpcPayload,
  RecordInjectionRunCompletedRpcInput,
  RecordInjectionRunCompletedRpcPayload,
} from "./rpc/runtime-operations-rpc-contract.js";
export type {
  ClearHighAssuranceChallengeRpcInput,
  ClearHighAssuranceChallengeRpcPayload,
  DenyHighAssuranceChallengeRpcInput,
  DenyHighAssuranceChallengeRpcPayload,
  GetHighAssuranceChallengeRpcInput,
  GetHighAssuranceChallengeRpcPayload,
  HighAssuranceChallengeLifecycleState,
  HighAssuranceChallengeReviewItem,
  ListPendingHighAssuranceChallengesRpcInput,
  ListPendingHighAssuranceChallengesRpcPayload,
} from "./rpc/runtime-high-assurance-rpc-contract.js";
export type {
  RuntimeDeliveryAllEnvelope,
  RuntimeDeliveryAllPayload,
  RuntimeDeliveryEntryPayload,
  RuntimeDeliveryEnvelope,
  RuntimeDeliveryPayload,
} from "./rpc/runtime-delivery-rpc-contract.js";
export { RuntimeRpcResultError, unwrapRuntimeResult } from "./rpc/unwrap-runtime-result.js";
export { apiClientFor, type ApiClientEnv } from "./rpc/api-client.js";
export {
  runtimeClientFor,
  type AuthenticatedRuntimeClient,
  type RuntimeClientEnv,
} from "./rpc/runtime-client.js";
export {
  RuntimeTokenSigningSecretConfigError,
  validateRuntimeTokenSigningSecret,
} from "./rpc/runtime-token-signing-secret.js";
// Re-export the RPC payload types the public-edge callers need but should not import from the
// DB-backed store packages directly (the edge drops those deps per ADR-0077).
export type {
  AcceptInvitationResult,
  CreateInvitationResult,
  CreateOperatorOrganizationResult,
  ProvisionGuidedOrganizationResult,
} from "@insecur/onboarding";
export type { OperationPollResult } from "@insecur/operations";
export type { IssueInjectionGrantResult } from "@insecur/runtime-injection-issue";
export type {
  BootstrapStatus,
  CompleteBootstrapOperatorClaimResult,
} from "@insecur/instance-bootstrap";

export type { AuthWorkerEnv, RuntimeAdmissionRpc } from "./auth/auth-worker-env.js";
export { AuthFailureError } from "./auth/auth-failure-error.js";
export {
  createRuntimeAdmittedUserResolver,
  recordAdmissionDeniedViaBinding,
  resolveAdmissionViaBinding,
  resolveInstanceId,
} from "./auth/admitted-user-resolver.js";
export { createAuthConfig } from "./auth/config.js";
export {
  FakeWorkOSSessionConfigError,
  createWorkOSSessionPortFromEnv,
} from "./auth/workos-port.js";
export {
  AuthConfigError,
  createAuthContext,
  validateAuthContext,
  type AuthConfigField,
  type AuthContext,
  type CreateAuthContextOptions,
} from "./auth/auth-context.js";
export { requireUserActor, type AuthVariables } from "./auth/middleware.js";
export { recordAdmissionDeniedAuditForAuthFailure } from "./auth/record-admission-denied-audit.js";

export { AbuseLimitError } from "./abuse/abuse-limit-error.js";
export { enforcePublicEdgeAbuseControl } from "./abuse/enforce-public-edge-abuse-control.js";
export { enforcePublicEdgeRateLimit } from "./abuse/public-edge-rate-limit.js";
export type { PublicEdgeAbuseTarget } from "./abuse/public-edge-abuse-target.js";
export type { PublicEdgeRateLimitBindings } from "./abuse/public-edge-rate-limit-bindings.js";
export type { RateLimiterBinding } from "./abuse/rate-limiter-binding.js";
export {
  createInMemoryRateLimiter,
  createPassThroughRateLimiter,
} from "./abuse/rate-limiter-binding.js";
export { recordAbuseDeniedAudit } from "./abuse/record-abuse-denied-audit.js";
export {
  createFakeAdmittedUserResolver,
  createTestAuthContext,
} from "./auth/testing/create-test-auth-context.js";
