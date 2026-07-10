import type { WorkOS } from "@workos-inc/node";
import type { WorkOSAuthConfig } from "./workos-config.js";

/**
 * Real-adapter half of `WorkOSSessionPort.getSessionLogoutUrl`: unseal the session and map it to
 * the provider logout URL, or null when the sealed session no longer authenticates.
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
  if (!result.authenticated) {
    return null;
  }
  // The URL carries only the opaque session id; redirecting the browser there revokes the WorkOS
  // session and clears the AuthKit cookie, then WorkOS sends the browser to the environment's
  // configured Logout Redirect URI.
  return workos.userManagement.getLogoutUrl({ sessionId: result.sessionId });
}
