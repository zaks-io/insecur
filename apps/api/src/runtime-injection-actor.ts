import type { RuntimeHopActor } from "@insecur/auth";
import {
  machineActorFromVerifiedMachineAccessToken,
  verifyMachineAccessToken,
} from "@insecur/machine-auth";
import {
  AuthFailureError,
  createRequestId,
  recordAdmissionDeniedAuditForAuthFailure,
  resolveRequestUserActor,
} from "@insecur/worker-kit";
import { createMiddleware } from "hono/factory";

import type { ApiEnv } from "./env.js";

export interface RuntimeInjectionActorVariables {
  requestActor: RuntimeHopActor;
}

function bearerCredential(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(.+)$/iu.exec(header ?? "");
  return match?.[1];
}

export const requireRuntimeInjectionActor = createMiddleware<{
  Bindings: ApiEnv;
  Variables: RuntimeInjectionActorVariables;
}>(async (context, next) => {
  const authorizationHeader = context.req.header("Authorization");
  const credential = bearerCredential(authorizationHeader);
  if (credential !== undefined) {
    const machine = await verifyMachineAccessToken(credential, context.env.SESSION_SIGNING_SECRET);
    if (machine.ok) {
      context.set("requestActor", machineActorFromVerifiedMachineAccessToken(machine.token));
      await next();
      return;
    }
  }

  const user = await resolveRequestUserActor({
    env: context.env,
    authorizationHeader,
    cookieHeader: null,
    csrfHeader: null,
  });
  if (!user.ok) {
    const reqId = createRequestId();
    await recordAdmissionDeniedAuditForAuthFailure(context.env, user.failure, reqId);
    throw new AuthFailureError(user.failure, reqId);
  }
  context.set("requestActor", user.actor);
  await next();
});
