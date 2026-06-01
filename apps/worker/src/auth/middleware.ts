import { parseRequestCredentials, resolveUserActor, type UserActor } from "@insecur/auth";
import { errorEnvelope, requestId } from "@insecur/domain";
import { createMiddleware } from "hono/factory";
import { createAdmittedUserResolver, createAuthConfig } from "./config.js";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import type { WorkerEnv } from "../env.js";

export interface AuthVariables {
  userActor: UserActor;
}

export const requireUserActor = createMiddleware<{
  Bindings: WorkerEnv;
  Variables: AuthVariables;
}>(async (context, next) => {
  const config = createAuthConfig(context.env);
  const workos = createWorkOSSessionPortFromEnv(context.env);
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: context.req.header("Cookie"),
    csrfHeader: context.req.header("x-insecur-csrf"),
  });
  const resolved = await resolveUserActor({
    credentials,
    config,
    workos,
    resolveAdmittedUser: createAdmittedUserResolver(context.env),
  });
  if (!resolved.ok) {
    const reqId = requestId.generate();
    return context.json(
      errorEnvelope(
        {
          code: resolved.failure.code,
          message: resolved.failure.message,
          retryable: resolved.failure.retryable,
        },
        { requestId: reqId },
      ),
      401,
    );
  }
  context.set("userActor", resolved.actor);
  await next();
});
