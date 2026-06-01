import {
  exchangeCliSession,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  parseRequestCredentials,
} from "@insecur/auth";
import { errorEnvelope, requestId, successEnvelope } from "@insecur/domain";
import { Hono } from "hono";
import { createAdmittedUserResolver, createAuthConfig } from "../../auth/config.js";
import { createWorkOSSessionPortFromEnv } from "../../auth/workos-port.js";
import type { WorkerEnv } from "../../env.js";

export const authRoutes = new Hono<{ Bindings: WorkerEnv }>();

authRoutes.post("/cli/exchange", async (context) => {
  const reqId = requestId.generate();
  const config = createAuthConfig(context.env);
  const workos = createWorkOSSessionPortFromEnv(context.env);
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: context.req.header("Cookie"),
    csrfHeader: context.req.header("x-insecur-csrf"),
  });
  const exchanged = await exchangeCliSession({
    credentials,
    config,
    workos,
    resolveAdmittedUser: createAdmittedUserResolver(context.env),
    requireCsrf: true,
    requestId: reqId,
  });
  if (!exchanged.ok) {
    return context.json(
      errorEnvelope(
        {
          code: exchanged.failure.code,
          message: exchanged.failure.message,
          retryable: exchanged.failure.retryable,
        },
        { requestId: reqId },
      ),
      401,
    );
  }
  return context.json(successEnvelope(exchanged.body, { requestId: reqId }), 200, {
    [INSECUR_SESSION_CREDENTIAL_HEADER]: exchanged.credential,
  });
});
