export type { AdmittedUserResolver } from "./admitted-user.js";
export { authFailureForReason, type AuthFailure, type AuthFailureReason } from "./auth-failure.js";
export {
  CLI_SESSION_TTL_SECONDS,
  INSECUR_CSRF_COOKIE,
  INSECUR_CSRF_HEADER,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  WORKOS_SESSION_COOKIE,
} from "./constants.js";
export {
  type ParseRequestCredentialsInput,
  type ParsedRequestCredentials,
  parseRequestCredentials,
} from "./credentials.js";
export {
  csrfCookieAttributes,
  csrfHeaderName,
  generateCsrfToken,
  validateCsrfToken,
} from "./csrf.js";
export {
  HIGH_ASSURANCE_AUTHENTICATION_METHODS,
  hasEligibleEnrolledMfaFactor,
  INSUFFICIENT_ASSURANCE_AUTHENTICATION_METHODS,
  isHighAssuranceAuthenticationMethod,
  isSmsAuthFactor,
  type WorkOSAuthFactorSummary,
  type WorkOSAuthFactorType,
} from "./mfa-posture.js";
export {
  authenticateWorkOSSession,
  refreshWorkOSSession,
  type RefreshWorkOSSessionResult,
  type RefreshWorkOSSessionSuccess,
  type ResolveWorkOSSessionResult,
} from "./resolve-workos-session.js";
export {
  evaluateSessionAssurance,
  type EvaluateSessionAssuranceInput,
  type SessionAssuranceFailureReason,
  type SessionAssuranceResult,
} from "./session-assurance.js";
export {
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  type SessionCookieAttributes,
  workosSessionCookieAttributes,
} from "./session-cookies.js";
export {
  type MintEphemeralSessionInput,
  type MintEphemeralSessionResult,
  mintEphemeralSessionCredential,
  type VerifyEphemeralSessionResult,
  verifyEphemeralSessionCredential,
} from "./ephemeral-session.js";
export {
  exchangeCliSession,
  type CliSessionExchangeInput,
  type CliSessionExchangeResult,
  type CliSessionExchangeSuccess,
} from "./cli-exchange.js";
export {
  type ResolveUserActorInput,
  type ResolveUserActorResult,
  resolveUserActor,
} from "./resolve-user-actor.js";
export {
  createFakeWorkOSSessionPort,
  type FakeWorkOSSessionEntry,
} from "./testing/fake-workos-session.js";
export { testSessionSigningSecret } from "./testing/test-session-signing-secret.js";
export type { UserActor } from "./user-actor.js";
export type { InsecurAuthConfig, WorkOSAuthConfig } from "./workos-config.js";
export { createWorkOSSessionPort } from "./workos-session.js";
export type {
  WorkOSAuthenticatedUser,
  WorkOSSessionAuthenticateResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
  WorkOSSessionRefreshResult,
} from "./workos-session-port.js";
