import { WorkOS } from "@workos-inc/node";
import type { WorkOSAuthConfig } from "./workos-config.js";
import type { WorkOSSessionAuthenticateResult, WorkOSSessionPort } from "./workos-session-port.js";

function mapAuthenticateFailure(reason: string | undefined): WorkOSSessionAuthenticateResult {
  if (reason === "invalid_jwt" || reason === "INVALID_JWT") {
    return { authenticated: false, reason: "invalid" };
  }
  if (reason === "no_session_cookie_provided") {
    return { authenticated: false, reason: "missing" };
  }
  return { authenticated: false, reason: "expired" };
}

export function createWorkOSSessionPort(config: WorkOSAuthConfig): WorkOSSessionPort {
  const workos = new WorkOS(config.apiKey, { clientId: config.clientId });

  return {
    async authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult> {
      const session = workos.userManagement.loadSealedSession({
        sessionData,
        cookiePassword: config.cookiePassword,
      });
      const result = await session.authenticate();
      if (!result.authenticated) {
        return mapAuthenticateFailure(result.reason);
      }
      const user = { id: result.user.id, email: result.user.email };
      return {
        authenticated: true,
        user,
        sessionId: result.sessionId,
      };
    },
  };
}
