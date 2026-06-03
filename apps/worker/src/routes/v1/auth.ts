import {
  exchangeCliSession,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  parseRequestCredentials,
} from "@insecur/auth";
import { requestId, successEnvelope } from "@insecur/domain";
import { Hono } from "hono";
import { AuthFailureError } from "../../auth/auth-failure-error.js";
import { createAuthContext } from "../../auth/auth-context.js";
import type { WorkerEnv } from "../../env.js";

export const authRoutes = new Hono<{ Bindings: WorkerEnv }>();

authRoutes.post("/cli/exchange", async (context) => {
  const reqId = requestId.generate();
  const { config, workos, resolveAdmittedUser } = createAuthContext(context.env);
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: context.req.header("Cookie"),
    csrfHeader: context.req.header("x-insecur-csrf"),
  });
  const exchanged = await exchangeCliSession({
    credentials,
    config,
    workos,
    resolveAdmittedUser,
    requestId: reqId,
  });
  if (!exchanged.ok) {
    throw new AuthFailureError(exchanged.failure);
  }
  return context.json(successEnvelope(exchanged.body, { requestId: reqId }), 200, {
    [INSECUR_SESSION_CREDENTIAL_HEADER]: exchanged.credential,
  });
});
