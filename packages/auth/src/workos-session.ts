import { OauthException, WorkOS } from "@workos-inc/node";
import { base64UrlToBytes } from "@insecur/domain";
import type { WorkOSAuthFactorSummary } from "./mfa-posture.js";
import type { WorkOSAuthConfig } from "./workos-config.js";
import type {
  WorkOSAuthorizationCodeInput,
  WorkOSAuthorizationCodeResult,
  WorkOSAuthorizationUrlInput,
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

function sessionIdFromAccessToken(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (payload === undefined) {
    return null;
  }
  const bytes = base64UrlToBytes(payload);
  if (bytes === null) {
    return null;
  }
  try {
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return typeof claims.sid === "string" ? claims.sid : null;
  } catch {
    return null;
  }
}

function mapAuthorizationCodeFailure(error: unknown): WorkOSAuthorizationCodeResult {
  if (error instanceof OauthException) {
    if (error.error === "mfa_enrollment" || error.error === "mfa_challenge") {
      return { authenticated: false, reason: error.error };
    }
    if (error.error === "invalid_grant") {
      return { authenticated: false, reason: "invalid" };
    }
  }
  throw error;
}

function createAuthorizationUrlWithWorkOS(
  workos: WorkOS,
  config: WorkOSAuthConfig,
  input: WorkOSAuthorizationUrlInput,
): string {
  return workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    clientId: config.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    ...(input.screenHint === undefined ? {} : { screenHint: input.screenHint }),
    ...(input.loginHint === undefined ? {} : { loginHint: input.loginHint }),
    ...(input.maxAge === undefined ? {} : { maxAge: input.maxAge }),
  });
}

async function authenticateAuthorizationCodeWithWorkOS(
  workos: WorkOS,
  config: WorkOSAuthConfig,
  input: WorkOSAuthorizationCodeInput,
): Promise<WorkOSAuthorizationCodeResult> {
  try {
    const result = await workos.userManagement.authenticateWithCode({
      clientId: config.clientId,
      code: input.code,
      codeVerifier: input.codeVerifier,
      session: {
        sealSession: true,
        cookiePassword: config.cookiePassword,
      },
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
    });
    const sessionId = sessionIdFromAccessToken(result.accessToken);
    if (sessionId === null || result.sealedSession === undefined) {
      return { authenticated: false, reason: "invalid" };
    }
    const authFactors = await listAuthFactorsForUser(workos, result.user.id);
    return {
      authenticated: true,
      sealedSession: result.sealedSession,
      context: contextFromAuthenticate(
        result.user,
        sessionId,
        result.authenticationMethod,
        authFactors,
      ),
    };
  } catch (error) {
    return mapAuthorizationCodeFailure(error);
  }
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
    createAuthorizationUrl: (input) => createAuthorizationUrlWithWorkOS(workos, config, input),
    authenticateAuthorizationCode: (input) =>
      authenticateAuthorizationCodeWithWorkOS(workos, config, input),
    authenticateSealedSession: (sessionData) =>
      authenticateSealedSessionWithWorkOS(workos, config, sessionData),
    refreshSealedSession: (sessionData) =>
      refreshSealedSessionWithWorkOS(workos, config, sessionData),
    listAuthFactors: (userId) => listAuthFactorsForUser(workos, userId),
  };
}
