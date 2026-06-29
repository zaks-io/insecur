import { exchangeCliPkceSession, INSECUR_SESSION_CREDENTIAL_HEADER } from "@insecur/auth";
import { errorEnvelope, requestId, successEnvelope, VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  AuthFailureError,
  createAuthContext,
  recordAdmissionDeniedAuditForAuthFailure,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ApiEnv } from "../../env.js";

export const authRoutes = new Hono<{ Bindings: ApiEnv }>();

type AuthRouteContext = Context<{ Bindings: ApiEnv }>;

function requestHeaderValue(context: AuthRouteContext, name: string) {
  const value = context.req.header(name);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function validationError(context: AuthRouteContext, message: string) {
  return context.json(
    errorEnvelope({
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
      message,
      retryable: false,
    }),
    400,
  );
}

function requireQueryParam(context: AuthRouteContext, name: string) {
  const value = context.req.query(name);
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value;
}

function isLoopbackRedirectUri(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]")
  );
}

type ParsedPkceExchangeBody =
  | { readonly ok: true; readonly code: string; readonly codeVerifier: string }
  | { readonly ok: false; readonly response: Response };

async function parsePkceExchangeBody(context: AuthRouteContext): Promise<ParsedPkceExchangeBody> {
  const body: unknown = await context.req.json().catch(() => null);
  if (body === null || typeof body !== "object") {
    return { ok: false, response: validationError(context, "Expected JSON PKCE exchange body.") };
  }
  const record = body as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const codeVerifier = typeof record.codeVerifier === "string" ? record.codeVerifier : "";
  if (code.trim() === "" || codeVerifier.trim() === "") {
    return {
      ok: false,
      response: validationError(context, "Missing PKCE exchange code or verifier."),
    };
  }
  return { ok: true, code, codeVerifier };
}

authRoutes.get("/cli/authorize", (context) => {
  const redirectUri = requireQueryParam(context, "redirect_uri");
  const state = requireQueryParam(context, "state");
  const codeChallenge = requireQueryParam(context, "code_challenge");
  const codeChallengeMethod = requireQueryParam(context, "code_challenge_method");
  if (
    redirectUri === null ||
    state === null ||
    codeChallenge === null ||
    codeChallengeMethod === null
  ) {
    return validationError(context, "Missing PKCE authorization parameter.");
  }
  if (!isLoopbackRedirectUri(redirectUri)) {
    return validationError(context, "CLI redirect URI must be loopback HTTP.");
  }
  if (codeChallengeMethod !== "S256") {
    return validationError(context, "CLI PKCE challenge method must be S256.");
  }

  const { workos } = createAuthContext(context.env);
  const authorizationUrl = workos.createAuthorizationUrl({
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    screenHint: "sign-in",
  });
  return context.redirect(authorizationUrl, 302);
});

authRoutes.post("/cli/pkce/exchange", async (context) => {
  const reqId = requestId.generate();
  const { config, workos, resolveAdmittedUser } = createAuthContext(context.env);
  const parsed = await parsePkceExchangeBody(context);
  if (!parsed.ok) {
    return parsed.response;
  }

  const ipAddress = requestHeaderValue(context, "cf-connecting-ip");
  const userAgent = requestHeaderValue(context, "user-agent");
  const exchanged = await exchangeCliPkceSession({
    code: parsed.code,
    codeVerifier: parsed.codeVerifier,
    config,
    workos,
    resolveAdmittedUser,
    requestId: reqId,
    ...(ipAddress === undefined ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  });
  if (!exchanged.ok) {
    await recordAdmissionDeniedAuditForAuthFailure(context.env, exchanged.failure, reqId);
    throw new AuthFailureError(exchanged.failure, reqId);
  }
  return context.json(successEnvelope(exchanged.body, { requestId: reqId }), 200, {
    [INSECUR_SESSION_CREDENTIAL_HEADER]: exchanged.credential,
  });
});
