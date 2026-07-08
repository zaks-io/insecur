import { type UserActor } from "@insecur/auth";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { createRequestId } from "../http/handle-route.js";
import { AuthFailureError } from "./auth-failure-error.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { recordAdmissionDeniedAuditForAuthFailure } from "./record-admission-denied-audit.js";
import { resolveRequestUserActor } from "./resolve-request-user-actor.js";

export interface AuthVariables {
  userActor: UserActor;
}

type UserActorMiddlewareContext = Context<{
  Bindings: AuthWorkerEnv;
  Variables: AuthVariables;
}>;

async function resolveAndSetUserActor(
  context: UserActorMiddlewareContext,
  options?: { readonly acceptAnyScopedAccessAudience?: boolean },
): Promise<void> {
  const resolved = await resolveRequestUserActor({
    env: context.env,
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: null,
    csrfHeader: null,
    ...(options?.acceptAnyScopedAccessAudience === true
      ? { acceptAnyScopedAccessAudience: true }
      : {}),
  });
  if (!resolved.ok) {
    const reqId = createRequestId();
    await recordAdmissionDeniedAuditForAuthFailure(context.env, resolved.failure, reqId);
    throw new AuthFailureError(resolved.failure, reqId);
  }
  context.set("userActor", resolved.actor);
}

export const requireUserActor = createMiddleware<{
  Bindings: AuthWorkerEnv;
  Variables: AuthVariables;
}>(async (context, next) => {
  await resolveAndSetUserActor(context);
  await next();
});

/** Like {@link requireUserActor}, but admits scoped-access tokens for any audience so whoami can reject runtime-audience tokens in-handler. */
export const requireUserActorForWhoami = createMiddleware<{
  Bindings: AuthWorkerEnv;
  Variables: AuthVariables;
}>(async (context, next) => {
  await resolveAndSetUserActor(context, { acceptAnyScopedAccessAudience: true });
  await next();
});
