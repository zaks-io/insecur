import { parseRequestCredentials, resolveUserActor, type UserActor } from "@insecur/auth";
import { createMiddleware } from "hono/factory";
import { AuthFailureError } from "./auth-failure-error.js";
import { createAuthContext } from "./auth-context.js";
import type { WorkerEnv } from "../env.js";

export interface AuthVariables {
  userActor: UserActor;
}

export const requireUserActor = createMiddleware<{
  Bindings: WorkerEnv;
  Variables: AuthVariables;
}>(async (context, next) => {
  const { config, workos, resolveAdmittedUser } = createAuthContext(context.env);
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: context.req.header("Cookie"),
    csrfHeader: context.req.header("x-insecur-csrf"),
  });
  const resolved = await resolveUserActor({
    credentials,
    config,
    workos,
    resolveAdmittedUser,
  });
  if (!resolved.ok) {
    throw new AuthFailureError(resolved.failure);
  }
  context.set("userActor", resolved.actor);
  await next();
});
