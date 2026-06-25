import { parseRequestCredentials, resolveUserActor, type UserActor } from "@insecur/auth";
import { createMiddleware } from "hono/factory";
import { createRequestId } from "../http/handle-route.js";
import { AuthFailureError } from "./auth-failure-error.js";
import { createAuthContext } from "./auth-context.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { recordAdmissionDeniedAuditForAuthFailure } from "./record-admission-denied-audit.js";

export interface AuthVariables {
  userActor: UserActor;
}

export const requireUserActor = createMiddleware<{
  Bindings: AuthWorkerEnv;
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
    const reqId = createRequestId();
    await recordAdmissionDeniedAuditForAuthFailure(context.env, resolved.failure, reqId);
    throw new AuthFailureError(resolved.failure, reqId);
  }
  context.set("userActor", resolved.actor);
  await next();
});
