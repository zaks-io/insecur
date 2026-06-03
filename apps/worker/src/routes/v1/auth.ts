import {
  exchangeCliSession,
  formatSessionSetCookie,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  parseRequestCredentials,
  workosSessionCookieAttributes,
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
  const headers: Record<string, string> = {
    [INSECUR_SESSION_CREDENTIAL_HEADER]: exchanged.credential,
  };
  if (exchanged.rotation !== undefined) {
    headers["Set-Cookie"] = formatSessionSetCookie(
      workosSessionCookieAttributes,
      exchanged.rotation.sealedSession,
    );
  }
  return context.json(successEnvelope(exchanged.body, { requestId: reqId }), 200, headers);
});
