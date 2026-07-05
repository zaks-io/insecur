import type { WebEnv } from "../env.js";

export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";
export const TURNSTILE_LOGIN_ACTION = "web-login";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 5_000;

type TurnstileFailureReason =
  | "configuration"
  | "missing_token"
  | "invalid_token"
  | "rejected"
  | "unavailable";

export type TurnstileVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: TurnstileFailureReason };

interface TurnstileSiteverifyResponse {
  readonly success?: unknown;
  readonly action?: unknown;
}

function normalizeConfigValue(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function turnstileSiteKey(env: WebEnv): string {
  const siteKey = normalizeConfigValue(env.TURNSTILE_SITE_KEY);
  if (siteKey === null) {
    throw new Error("turnstile configuration invalid: TURNSTILE_SITE_KEY must be set");
  }
  return siteKey;
}

function turnstileSecretKey(env: WebEnv): string | null {
  return normalizeConfigValue(env.TURNSTILE_SECRET_KEY);
}

export function readTurnstileToken(formData: FormData): string | null {
  const value = formData.get(TURNSTILE_RESPONSE_FIELD);
  if (typeof value !== "string") {
    return null;
  }

  const token = value.trim();
  if (token.length === 0 || token.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return null;
  }
  return token;
}

function parseSiteverifyResponse(body: unknown): TurnstileSiteverifyResponse | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  return body;
}

function siteverifyRequestBody(
  request: Request,
  secret: string,
  token: string,
): Record<string, string> {
  const body: Record<string, string> = {
    secret,
    response: token,
    idempotency_key: crypto.randomUUID(),
  };
  const remoteIp = normalizeConfigValue(request.headers.get("CF-Connecting-IP") ?? undefined);
  if (remoteIp !== null) {
    body.remoteip = remoteIp;
  }
  return body;
}

async function postSiteverify(
  body: Record<string, string>,
): Promise<TurnstileSiteverifyResponse | null> {
  const response = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
  });
  if (!response.ok) {
    return null;
  }
  return parseSiteverifyResponse(await response.json());
}

function evaluateSiteverifyResponse(
  payload: TurnstileSiteverifyResponse | null,
  expectedAction: string,
): TurnstileVerificationResult {
  if (payload === null) {
    return { ok: false, reason: "unavailable" };
  }
  if (payload.success !== true) {
    return { ok: false, reason: "rejected" };
  }
  if (payload.action !== expectedAction) {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true };
}

export async function verifyTurnstileToken(
  request: Request,
  env: WebEnv,
  token: string | null,
  expectedAction = TURNSTILE_LOGIN_ACTION,
): Promise<TurnstileVerificationResult> {
  const secret = turnstileSecretKey(env);
  if (token === null) {
    return { ok: false, reason: "missing_token" };
  }
  if (secret === null) {
    return { ok: false, reason: "configuration" };
  }

  try {
    const payload = await postSiteverify(siteverifyRequestBody(request, secret, token));
    return evaluateSiteverifyResponse(payload, expectedAction);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
