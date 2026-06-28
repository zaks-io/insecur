export { createRequestId, handleDeliveryRoute, handleRoute } from "./http/handle-route.js";
export {
  HTTP_STATUS_BY_CODE,
  domainErrorEnvelope,
  httpStatusForKnownErrorCode,
  knownErrorCodeFromUnknown,
} from "./http/domain-error-response.js";
export {
  encodeRequestValueUtf8,
  parseEnvironmentIdParam,
  parseGrantIdParam,
  parseGuidedOrganizationResourceIds,
  parseInjectionGrantConsumeSelector,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseOperationIdParam,
  parseOptionalDisplayName,
  parseOptionalSecretId,
  parseOrganizationIdParam,
  parseProjectIdParam,
  parseVariableKeyField,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  readSecretValueField,
  requireRouteParam,
  type InjectionGrantConsumeSelectorInput,
  type InjectionGrantIssueSelectorInput,
} from "./http/parse-route-input.js";
export { authorizeScopeOrThrow } from "./http/authorize-scope.js";
export { toAccessActor, toAuditActor } from "./http/request-actor.js";

export type {
  ConsumeGrantRpcInput,
  RuntimeGeneratedSecretInput,
  RuntimeDeliveryEnvelope,
  RuntimeDeliveryPayload,
  RuntimeRpc,
  RuntimeRpcError,
  RuntimeRpcResult,
  RuntimeSecretWritePayload,
  WriteSecretRpcInput,
} from "./rpc/runtime-rpc-contract.js";

export type { AuthWorkerEnv } from "./auth/auth-worker-env.js";
export { AuthFailureError } from "./auth/auth-failure-error.js";
export {
  createAdmittedUserResolver,
  createStoreAdmittedUserResolver,
  resolveInstanceId,
} from "./auth/admitted-user-resolver.js";
export { createAuthConfig } from "./auth/config.js";
export { createWorkOSSessionPortFromEnv } from "./auth/workos-port.js";
export {
  AuthConfigError,
  createAuthContext,
  validateAuthContext,
  type AuthConfigField,
  type AuthContext,
  type CreateAuthContextOptions,
} from "./auth/auth-context.js";
export { requireUserActor, type AuthVariables } from "./auth/middleware.js";
export {
  recordAdmissionDeniedAudit,
  recordAdmissionDeniedAuditForAuthFailure,
} from "./auth/record-admission-denied-audit.js";
export {
  createFakeAdmittedUserResolver,
  createTestAuthContext,
} from "./auth/testing/create-test-auth-context.js";
