import {
  exchangeCliDeviceSession,
  exchangeCliPkceSession,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  startCliDeviceAuthorization,
} from "@insecur/auth";
import { errorEnvelope, requestId, successEnvelope, VALIDATION_ERROR_CODES } from "@insecur/domain";
import {
  AuthFailureError,
  AbuseLimitError,
  createAuthContext,
  domainErrorEnvelope,
  enforcePublicEdgeAbuseControl,
  httpStatusForKnownErrorCode,
  recordAdmissionDeniedAuditForAuthFailure,
  type PublicEdgeAbuseTarget,
} from "@insecur/worker-kit";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiApp, ApiEnv } from "../../env.js";
import {
  parseDeviceAuthorizationIntent,
  parseDeviceTokenBody,
  recordDeviceTokenApprovedAudit,
  recordDeviceTokenDeniedAudit,
} from "./auth-device-route-helpers.js";

const authRoutes = new Hono<{ Bindings: ApiEnv }>();

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

async function enforceAuthExchangeRateLimit(
  context: AuthRouteContext,
  reqId: ReturnType<typeof requestId.generate>,
  target: PublicEdgeAbuseTarget = "auth_cli_pkce_exchange",
): Promise<Response | null> {
  try {
    await enforcePublicEdgeAbuseControl(context.env, (name: string) => context.req.header(name), {
      target,
      requestId: reqId,
    });
    return null;
  } catch (error) {
    if (error instanceof AbuseLimitError) {
      const { status, body } = domainErrorEnvelope(error, reqId);
      return context.json(body, status as 429);
    }
    throw error;
  }
}

authRoutes.post("/cli/pkce/exchange", async (context) => {
  const reqId = requestId.generate();
  const rateLimited = await enforceAuthExchangeRateLimit(context, reqId);
  if (rateLimited !== null) {
    return rateLimited;
  }

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

// Starts an OAuth device-authorization flow for headless/remote shells (ADR-0010). WorkOS is called
// at the edge; no keyring or DB binding is added. The cross-device consent-phishing warning is shown
// by the CLI before the human approves (ADR-0010 required treatment).
authRoutes.post("/cli/device/authorize", async (context) => {
  const reqId = requestId.generate();
  const rateLimited = await enforceAuthExchangeRateLimit(context, reqId, "auth_cli_device_token");
  if (rateLimited !== null) {
    return rateLimited;
  }
  const { workos } = createAuthContext(context.env);
  const intent = parseDeviceAuthorizationIntent(await context.req.json().catch(() => null));
  const requesterIp = requestHeaderValue(context, "cf-connecting-ip");
  const started = await startCliDeviceAuthorization(workos, context.env.SESSION_SIGNING_SECRET, {
    ...intent,
    ...(requesterIp === undefined ? {} : { requesterIp }),
  });
  return context.json(successEnvelope(started, { requestId: reqId }), 200);
});

type DeviceExchangeResult = Awaited<ReturnType<typeof exchangeCliDeviceSession>>;
type DeviceExchangeFailure = Extract<DeviceExchangeResult, { ok: false }>;

async function respondDeviceTokenFailure(
  context: AuthRouteContext,
  exchanged: DeviceExchangeFailure,
  reqId: ReturnType<typeof requestId.generate>,
): Promise<Response> {
  // Terminal device outcomes (denied 403, expired 401) carry their own registry status; other auth
  // failures (admission denial, MFA, invalid) route through AuthFailureError as usual.
  if (
    exchanged.failure.reason === "device_authorization_denied" ||
    exchanged.failure.reason === "device_authorization_expired"
  ) {
    await recordDeviceTokenDeniedAudit(context, exchanged, reqId);
    const status = httpStatusForKnownErrorCode(exchanged.failure.code);
    return context.json(
      errorEnvelope(
        {
          code: exchanged.failure.code,
          message: exchanged.failure.message,
          retryable: exchanged.failure.retryable,
        },
        { meta: { requestId: reqId } },
      ),
      status as ContentfulStatusCode,
    );
  }
  await recordAdmissionDeniedAuditForAuthFailure(context.env, exchanged.failure, reqId);
  throw new AuthFailureError(exchanged.failure, reqId);
}

// One WorkOS device-code poll per call. The CLI owns the polling loop and honors the pending /
// slow_down states. Admitted-user resolution forwards over the RUNTIME seam (ADR-0077).
authRoutes.post("/cli/device/token", async (context) => {
  const reqId = requestId.generate();
  const rateLimited = await enforceAuthExchangeRateLimit(context, reqId, "auth_cli_device_token");
  if (rateLimited !== null) {
    return rateLimited;
  }
  const { config, workos, resolveAdmittedUser } = createAuthContext(context.env);
  const parsed = parseDeviceTokenBody(await context.req.json().catch(() => null));
  if (!parsed.ok) {
    return validationError(context, parsed.message);
  }
  const exchanged = await exchangeCliDeviceSession({
    deviceCode: parsed.deviceCode,
    agentSession: parsed.agentSession,
    config,
    workos,
    resolveAdmittedUser,
    requestId: reqId,
  });
  if (!exchanged.ok) {
    return respondDeviceTokenFailure(context, exchanged, reqId);
  }
  if (exchanged.status !== "authenticated") {
    return context.json(successEnvelope({ status: exchanged.status }, { requestId: reqId }), 200);
  }
  await recordDeviceTokenApprovedAudit(context, exchanged, reqId);
  return context.json(successEnvelope(exchanged.body, { requestId: reqId }), 200, {
    [INSECUR_SESSION_CREDENTIAL_HEADER]: exchanged.credential,
  });
});

export function registerAuthRoutes(app: ApiApp): void {
  app.route("/v1/auth", authRoutes);
}
