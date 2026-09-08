import type { WebEnv } from "../env.js";

export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";
export const TURNSTILE_LOGIN_ACTION = "web-login";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_LOGIN_FORM_BODY_BYTES = 8 * 1024;
const SITEVERIFY_TIMEOUT_MS = 5_000;

type TurnstileFailureReason =
  "configuration" | "missing_token" | "invalid_token" | "rejected" | "unavailable";

export type TurnstileVerificationResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: TurnstileFailureReason };

interface TurnstileSiteverifyResponse {
  readonly success?: unknown;
  readonly action?: unknown;
  readonly hostname?: unknown;
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

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    return null;
  }

  if (request.body === null) {
    return new Uint8Array();
  }

  const chunks = await readBodyChunksAtMost(request.body, maxBytes);
  return chunks === null ? null : joinBodyChunks(chunks);
}

async function readBodyChunksAtMost(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<readonly Uint8Array[] | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let read = await reader.read();
  while (!read.done) {
    const { value } = read;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
    read = await reader.read();
  }

  return chunks;
}

function joinBodyChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const totalBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readLoginFormData(request: Request): Promise<FormData | null> {
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded" && mediaType !== "multipart/form-data") {
    return null;
  }

  try {
    const body = await readBoundedRequestBody(request, MAX_LOGIN_FORM_BODY_BYTES);
    if (body === null) {
      return null;
    }
    return await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    }).formData();
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
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
  expectedHostname: string,
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
  if (payload.hostname !== expectedHostname) {
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
    return evaluateSiteverifyResponse(payload, expectedAction, new URL(request.url).hostname);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
