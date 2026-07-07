import { authFailureForReason, type UserActor } from "@insecur/auth";
import { createMiddleware } from "hono/factory";
import { createRequestId } from "../http/handle-route.js";
import { AuthFailureError } from "./auth-failure-error.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { isCliSessionRevokedViaBinding, resolveInstanceId } from "./admitted-user-resolver.js";
import { recordAdmissionDeniedAuditForAuthFailure } from "./record-admission-denied-audit.js";
import { resolveRequestUserActor } from "./resolve-request-user-actor.js";

export interface AuthVariables {
  userActor: UserActor;
}

export const requireUserActor = createMiddleware<{
  Bindings: AuthWorkerEnv;
  Variables: AuthVariables;
}>(async (context, next) => {
  const resolved = await resolveRequestUserActor({
    env: context.env,
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: null,
    csrfHeader: null,
  });
  if (!resolved.ok) {
    const reqId = createRequestId();
    await recordAdmissionDeniedAuditForAuthFailure(context.env, resolved.failure, reqId);
    throw new AuthFailureError(resolved.failure, reqId);
  }
  const instanceId = resolveInstanceId(context.env);
  const revoked = await isCliSessionRevokedViaBinding(context.env.RUNTIME, {
    instanceId,
    sessionId: resolved.actor.sessionId,
  });
  if (revoked) {
    const reqId = createRequestId();
    throw new AuthFailureError(authFailureForReason("invalid"), reqId);
  }
  context.set("userActor", resolved.actor);
  await next();
});
