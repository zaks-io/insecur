import { parseRequestCredentials, resolveUserActor } from "@insecur/auth";
import { createAuthContext } from "./auth-context.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";

export interface ResolveRequestUserActorInput {
  readonly env: AuthWorkerEnv;
  readonly authorizationHeader: string | undefined;
  readonly cookieHeader: string | null;
  readonly csrfHeader: string | null;
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
  });
}
