import { parseRequestCredentials, resolveUserActor } from "@insecur/auth";
import { createAuthContext } from "./auth-context.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";

export interface ResolveRequestUserActorInput {
  readonly env: AuthWorkerEnv;
  readonly authorizationHeader: string | undefined;
  readonly cookieHeader: string | null;
  readonly csrfHeader: string | null;
  readonly acceptAnyScopedAccessAudience?: boolean;
  /**
   * Set only by the idempotent `/v1/session/revoke` route so an already-revoked session still
   * resolves to its userId (a repeat logout is a safe no-op success, not auth.invalid). Every
   * other caller leaves it unset and stays fail-closed on revoked sessions (INS-472).
   */
  readonly skipCliSessionRevocationCheck?: boolean;
}

/** Parse request credentials and resolve a user actor when present and valid. */
export async function resolveRequestUserActor(input: ResolveRequestUserActorInput) {
  const { config, resolveAdmittedUser } = createAuthContext(input.env);
  const credentials = parseRequestCredentials({
    authorizationHeader: input.authorizationHeader,
    cookieHeader: input.cookieHeader,
    csrfHeader: input.csrfHeader,
  });
  return resolveUserActor({
    credentials,
    config,
    resolveAdmittedUser,
    ...(input.acceptAnyScopedAccessAudience === true
      ? { acceptAnyScopedAccessAudience: true }
      : {}),
    ...(input.skipCliSessionRevocationCheck === true
      ? { skipCliSessionRevocationCheck: true }
      : {}),
  });
}
