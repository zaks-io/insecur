import {
  authFailureForReason,
  authenticateWorkOSSession,
  parseRequestCredentials,
  type AuthFailure,
  type WorkOSSessionContext,
  type WorkOSSessionPort,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import type { WebEnv } from "../env.js";

export type BrowserWorkOSSessionAuthResult =
  | { ok: true; context: WorkOSSessionContext; workos: WorkOSSessionPort }
  | { ok: false; failure: AuthFailure };

/** Authenticates the browser's WorkOS sealed session cookie for PKCE step-up flows. */
export async function authenticateBrowserWorkOSSession(
  request: Request,
  env: WebEnv,
): Promise<BrowserWorkOSSessionAuthResult> {
  const credentials = parseRequestCredentials({
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get("x-insecur-csrf") ?? undefined,
  });
  if (credentials.workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const workos = createWorkOSSessionPortFromEnv(env);
  const session = await authenticateWorkOSSession(workos, credentials.workosSealedSession);
  if (!session.ok) {
    return { ok: false, failure: session.failure };
  }

  return { ok: true, context: session.context, workos };
}
