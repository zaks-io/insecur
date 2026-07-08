import {
  parseRequestCredentials,
  readSessionCredentialMetadata,
  type SessionCredentialMetadata,
} from "@insecur/auth";
import type { Context } from "hono";
import type { ApiEnv } from "../../env.js";
import type { AuthVariables } from "@insecur/worker-kit";

type SessionRouteContext = Context<{ Bindings: ApiEnv; Variables: AuthVariables }>;

export async function readRequestSessionMetadata(
  context: SessionRouteContext,
): Promise<SessionCredentialMetadata> {
  const credentials = parseRequestCredentials({
    authorizationHeader: context.req.header("Authorization"),
    cookieHeader: null,
    csrfHeader: null,
  });
  const bearerCredential = credentials.bearerCredential;
  if (bearerCredential === undefined) {
    throw Object.assign(new Error("Authorization required."), { code: "auth.required" });
  }
  return readSessionCredentialMetadata(bearerCredential, context.env.SESSION_SIGNING_SECRET);
}

export async function readHumanSessionMetadata(
  context: SessionRouteContext,
): Promise<SessionCredentialMetadata> {
  const sessionMetadata = await readRequestSessionMetadata(context);
  if (sessionMetadata.agentMarked) {
    throw Object.assign(new Error("Agent-marked sessions cannot derive or register."), {
      code: "auth.insufficient_scope",
    });
  }
  return sessionMetadata;
}
