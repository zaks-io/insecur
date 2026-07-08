import {
  authFailureForReason,
  authenticateWorkOSSession,
  parseRequestCredentials,
  type AuthFailure,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import type { WebEnv } from "../env.js";

export async function authenticateBrowserWorkOSSession(
  request: Request,
  env: WebEnv,
): Promise<
  | {
      ok: true;
      readonly workos: ReturnType<typeof createWorkOSSessionPortFromEnv>;
      readonly workosUserId: string;
      readonly loginHint?: string;
    }
  | { ok: false; failure: AuthFailure }
> {
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

  return {
    ok: true,
    workos,
    workosUserId: session.context.user.id,
    ...(session.context.user.email === undefined ? {} : { loginHint: session.context.user.email }),
  };
}
