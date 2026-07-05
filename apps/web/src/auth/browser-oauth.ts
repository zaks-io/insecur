import {
  authFailureForReason,
  authenticateWorkOSAuthorizationCode,
  formatSessionClearCookie,
  formatSessionSetCookie,
  generateCsrfToken,
  insecurCsrfCookieAttributes,
  parseRequestCredentials,
  validateCsrfToken,
  workosSessionCookieAttributes,
  type AuthFailure,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import {
  createOAuthState,
  createPkcePair,
  decodePkceRoundTrip,
  encodePkceRoundTrip,
  formatPkceStateClearCookie,
  formatPkceStateCookie,
  INSECUR_OAUTH_PKCE_COOKIE,
  normalizeReturnTo,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";
import type { WebEnv } from "../env.js";

// Signed-in members land on the console; /orgs resolves the default organization (INS-367).
const DEFAULT_RETURN_TO = "/orgs";

export interface BrowserLoginStart {
  readonly authorizationUrl: string;
  readonly setCookieHeaders: readonly string[];
}

interface BrowserLoginCompleteSuccess {
  readonly redirectTo: string;
  readonly setCookieHeaders: readonly string[];
}

export type BrowserLoginCompleteResult =
  | { ok: true; value: BrowserLoginCompleteSuccess }
  | { ok: false; failure: AuthFailure };

export interface BrowserLogoutResult {
  readonly status: number;
  readonly clearCookieHeaders: readonly string[];
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (cookieHeader === null || cookieHeader === "") {
    return cookies;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    cookies.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  return cookies;
}

function browserCallbackUrl(request: Request): string {
  const url = new URL(request.url);
  url.pathname = "/auth/callback";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function establishBrowserSessionCookies(sealedSession: string): readonly string[] {
  const csrfToken = generateCsrfToken();
  return [
    formatSessionSetCookie(workosSessionCookieAttributes, sealedSession),
    formatSessionSetCookie(insecurCsrfCookieAttributes, csrfToken),
  ];
}

function clearBrowserSessionCookies(): readonly string[] {
  return [
    formatSessionClearCookie(workosSessionCookieAttributes),
    formatSessionClearCookie(insecurCsrfCookieAttributes),
  ];
}

export async function beginBrowserLogin(request: Request, env: WebEnv): Promise<BrowserLoginStart> {
  const url = new URL(request.url);
  const pkce = await createPkcePair();
  const state = createOAuthState();
  const returnTo = normalizeReturnTo(url.searchParams.get("returnTo"), DEFAULT_RETURN_TO);
  const roundTrip: PkceRoundTrip = {
    state,
    codeVerifier: pkce.verifier,
    returnTo,
  };
  const workos = createWorkOSSessionPortFromEnv(env);
  const authorizationUrl = workos.createAuthorizationUrl({
    redirectUri: browserCallbackUrl(request),
    state,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: "S256",
    screenHint: "sign-in",
  });
  return {
    authorizationUrl,
    setCookieHeaders: [formatPkceStateCookie(encodePkceRoundTrip(roundTrip))],
  };
}

function readOAuthCallback(request: Request): {
  readonly code: string;
  readonly state: string;
  readonly roundTrip: PkceRoundTrip;
} | null {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return null;
  }
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const roundTrip = decodePkceRoundTrip(cookies.get(INSECUR_OAUTH_PKCE_COOKIE));
  if (roundTrip?.state !== state) {
    return null;
  }
  return { code, state, roundTrip };
}

async function exchangeBrowserAuthorizationCode(
  env: WebEnv,
  request: Request,
  roundTrip: PkceRoundTrip,
  code: string,
): Promise<BrowserLoginCompleteResult> {
  const workos = createWorkOSSessionPortFromEnv(env);
  const ipAddress = request.headers.get("CF-Connecting-IP");
  const userAgent = request.headers.get("User-Agent");
  const exchanged = await authenticateWorkOSAuthorizationCode(workos, {
    code,
    codeVerifier: roundTrip.codeVerifier,
    ...(ipAddress === null ? {} : { ipAddress }),
    ...(userAgent === null ? {} : { userAgent }),
  });
  if (!exchanged.ok) {
    return { ok: false, failure: exchanged.failure };
  }
  return {
    ok: true,
    value: {
      redirectTo: roundTrip.returnTo,
      setCookieHeaders: [
        ...establishBrowserSessionCookies(exchanged.session.sealedSession),
        formatPkceStateClearCookie(),
      ],
    },
  };
}

export async function completeBrowserLogin(
  request: Request,
  env: WebEnv,
): Promise<BrowserLoginCompleteResult> {
  const callback = readOAuthCallback(request);
  if (callback === null) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  return exchangeBrowserAuthorizationCode(env, request, callback.roundTrip, callback.code);
}

export function logoutBrowserSession(request: Request): BrowserLogoutResult {
  const credentials = parseRequestCredentials({
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get("x-insecur-csrf"),
  });
  if (!validateCsrfToken(credentials.csrfCookie, credentials.csrfHeader)) {
    return { status: 403, clearCookieHeaders: [] };
  }
  return {
    status: 204,
    clearCookieHeaders: [...clearBrowserSessionCookies(), formatPkceStateClearCookie()],
  };
}

export function redirectResponse(
  location: string,
  setCookieHeaders: readonly string[],
  status = 302,
): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of setCookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status, headers });
}

export function responseWithSetCookies(
  status: number,
  setCookieHeaders: readonly string[],
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of setCookieHeaders) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status, headers });
}
