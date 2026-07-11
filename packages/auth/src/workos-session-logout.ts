import type { WorkOS } from "@workos-inc/node";
import type { WorkOSAuthConfig } from "./workos-config.js";

/**
 * Real-adapter half of `WorkOSSessionPort.getSessionLogoutUrl`: unseal the session and map it to
 * the provider logout URL, or null when the session cannot be recovered at all.
 */
export async function getSessionLogoutUrlWithWorkOS(
  workos: WorkOS,
  config: WorkOSAuthConfig,
  sessionData: string,
): Promise<string | null> {
  const session = workos.userManagement.loadSealedSession({
    sessionData,
    cookiePassword: config.cookiePassword,
  });
  const result = await session.authenticate();
  const sessionId = result.authenticated ? result.sessionId : await refreshedSessionId(session);
  if (sessionId === null) {
    return null;
  }
  // The URL carries only the opaque session id; redirecting the browser there revokes the WorkOS
  // session and clears the AuthKit cookie, then WorkOS sends the browser to the environment's
  // configured Logout Redirect URI.
  return workos.userManagement.getLogoutUrl({ sessionId });
}

/**
 * `authenticate()` fails once the access token inside the sealed session expires, but the WorkOS
 * server-side session (and the AuthKit SSO cookie) can still be alive — exactly the state a
 * sign-out must terminate (INS-582). Refresh recovers the live session id; an invalid or revoked
 * sealed session fails the refresh too and logout falls back to clearing local cookies only.
 */
async function refreshedSessionId(
  session: ReturnType<WorkOS["userManagement"]["loadSealedSession"]>,
): Promise<string | null> {
  const refreshed = await session.refresh();
  return refreshed.authenticated ? refreshed.sessionId : null;
}
