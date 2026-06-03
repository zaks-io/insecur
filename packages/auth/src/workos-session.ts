import { WorkOS } from "@workos-inc/node";
import type { WorkOSAuthFactorSummary } from "./mfa-posture.js";
import type { WorkOSAuthConfig } from "./workos-config.js";
import type {
  WorkOSSessionAuthenticateResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
  WorkOSSessionRefreshResult,
} from "./workos-session-port.js";

function mapAuthenticateFailure(reason: string | undefined): WorkOSSessionAuthenticateResult {
  if (reason === "invalid_jwt" || reason === "INVALID_JWT") {
    return { authenticated: false, reason: "invalid" };
  }
  if (reason === "no_session_cookie_provided") {
    return { authenticated: false, reason: "missing" };
  }
  return { authenticated: false, reason: "expired" };
}

function mapRefreshFailure(reason: string | undefined): WorkOSSessionRefreshResult {
  if (reason === "mfa_enrollment" || reason === "MFA_ENROLLMENT") {
    return { refreshed: false, reason: "mfa_enrollment" };
  }
  if (reason === "no_session_cookie_provided") {
    return { refreshed: false, reason: "missing" };
  }
  if (reason === "invalid_session_cookie" || reason === "invalid_jwt") {
    return { refreshed: false, reason: "invalid" };
  }
  return { refreshed: false, reason: "expired" };
}

async function listAuthFactorsForUser(
  workos: WorkOS,
  userId: string,
): Promise<readonly WorkOSAuthFactorSummary[]> {
  const page = await workos.multiFactorAuth.listUserAuthFactors({ userId });
  return page.data.map((factor: { type: string }) => ({ type: factor.type }));
}

function contextFromAuthenticate(
  user: { id: string; email?: string },
  sessionId: string,
  authenticationMethod: string | undefined,
  authFactors: readonly WorkOSAuthFactorSummary[],
): WorkOSSessionContext {
  const context: WorkOSSessionContext = {
    user: user.email === undefined ? { id: user.id } : { id: user.id, email: user.email },
    sessionId,
    authFactors,
  };
  if (authenticationMethod !== undefined) {
    return { ...context, authenticationMethod };
  }
  return context;
}

async function authenticateSealedSessionWithWorkOS(
  workos: WorkOS,
  config: WorkOSAuthConfig,
  sessionData: string,
): Promise<WorkOSSessionAuthenticateResult> {
  const session = workos.userManagement.loadSealedSession({
    sessionData,
    cookiePassword: config.cookiePassword,
  });
  const result = await session.authenticate();
  if (!result.authenticated) {
    return mapAuthenticateFailure(result.reason);
  }
  const authFactors = await listAuthFactorsForUser(workos, result.user.id);
  return {
    authenticated: true,
    context: contextFromAuthenticate(
      result.user,
      result.sessionId,
      result.authenticationMethod,
      authFactors,
    ),
  };
}

async function refreshSealedSessionWithWorkOS(
  workos: WorkOS,
  config: WorkOSAuthConfig,
  sessionData: string,
): Promise<WorkOSSessionRefreshResult> {
  const session = workos.userManagement.loadSealedSession({
    sessionData,
    cookiePassword: config.cookiePassword,
  });
  const result = await session.refresh();
  if (!result.authenticated) {
    return mapRefreshFailure(result.reason);
  }
  const sealedSession = result.sealedSession;
  if (sealedSession === undefined) {
    return { refreshed: false, reason: "invalid" };
  }
  const authFactors = await listAuthFactorsForUser(workos, result.user.id);
  return {
    refreshed: true,
    sealedSession,
    context: contextFromAuthenticate(
      result.user,
      result.sessionId,
      result.authenticationMethod,
      authFactors,
    ),
  };
}

export function createWorkOSSessionPort(config: WorkOSAuthConfig): WorkOSSessionPort {
  const workos = new WorkOS(config.apiKey, { clientId: config.clientId });
  return {
    authenticateSealedSession: (sessionData) =>
      authenticateSealedSessionWithWorkOS(workos, config, sessionData),
    refreshSealedSession: (sessionData) =>
      refreshSealedSessionWithWorkOS(workos, config, sessionData),
    listAuthFactors: (userId) => listAuthFactorsForUser(workos, userId),
  };
}
