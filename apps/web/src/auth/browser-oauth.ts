import {
  authFailureForReason,
  authenticateWorkOSAuthorizationCode,
  parseRequestCredentials,
  validateCsrfToken,
  type AuthFailure,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import {
  createOAuthState,
  createPkcePair,
  encodePkceRoundTrip,
  formatPkceStateClearCookie,
  formatPkceStateCookie,
  normalizeReturnTo,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";
import {
  clearBrowserSessionCookies,
  establishBrowserSessionCookies,
  oauthCallbackUrl,
  oauthRequestMetadata,
  readPkceOAuthCallback,
} from "./browser-oauth-common.js";
import { LOGOUT_CSRF_FIELD } from "./logout-contract.js";
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
  { ok: true; value: BrowserLoginCompleteSuccess } | { ok: false; failure: AuthFailure };

export type BrowserLogoutResult =
  | { readonly ok: false; readonly status: 403 }
  | {
      readonly ok: true;
      /**
       * Where the 303 sends the browser: the WorkOS logout URL when the sealed session resolves
       * (terminating the provider session so it cannot silently re-authenticate), otherwise
       * `/login` for a local-only logout.
       */
      readonly redirectTo: string;
      readonly clearCookieHeaders: readonly string[];
    };

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
  // This URL is the off-origin target the login form 303-redirects to. With no custom WorkOS
  // apiHostname configured (packages/auth/src/workos-session.ts), the SDK returns an
  // api.workos.com URL that then bounces to the tenant's hosted *.authkit.app domain. Both hops
  // must stay allowlisted in the CSP `form-action` directive via WORKOS_AUTHKIT_ORIGIN — see
  // apps/web/src/security/csp.ts. If the WorkOS host ever changes, update that env var too.
  const authorizationUrl = workos.createAuthorizationUrl({
    redirectUri: oauthCallbackUrl(request, "/auth/callback"),
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

async function exchangeBrowserAuthorizationCode(
  env: WebEnv,
  request: Request,
  roundTrip: PkceRoundTrip,
  code: string,
): Promise<BrowserLoginCompleteResult> {
  const workos = createWorkOSSessionPortFromEnv(env);
  const exchanged = await authenticateWorkOSAuthorizationCode(workos, {
    code,
    codeVerifier: roundTrip.codeVerifier,
    ...oauthRequestMetadata(request),
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
  const callback = readPkceOAuthCallback(request);
  if (callback === null) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  return exchangeBrowserAuthorizationCode(env, request, callback.roundTrip, callback.code);
}

/** Read the double-submit CSRF token out of a form-encoded logout POST body, if present. */
async function csrfTokenFromLogoutForm(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return undefined;
  }
  try {
    const value = (await request.formData()).get(LOGOUT_CSRF_FIELD);
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    // A malformed body is treated as no token: CSRF validation then fails closed.
    return undefined;
  }
}

async function workosLogoutRedirect(
  env: WebEnv,
  sealedSession: string | undefined,
): Promise<string | null> {
  if (sealedSession === undefined) {
    return null;
  }
  try {
    return await createWorkOSSessionPortFromEnv(env).getSessionLogoutUrl(sealedSession);
  } catch {
    // If WorkOS is unreachable the provider session cannot be terminated either way; still honor
    // the user's logout by clearing local cookies instead of leaving them signed in with a 500.
    return null;
  }
}

export async function logoutBrowserSession(
  request: Request,
  env: WebEnv,
): Promise<BrowserLogoutResult> {
  const credentials = parseRequestCredentials({
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get("x-insecur-csrf"),
  });
  const presentedCsrf = credentials.csrfHeader ?? (await csrfTokenFromLogoutForm(request));
  if (!validateCsrfToken(credentials.csrfCookie, presentedCsrf)) {
    return { ok: false, status: 403 };
  }
  const providerLogoutUrl = await workosLogoutRedirect(env, credentials.workosSealedSession);
  return {
    ok: true,
    redirectTo: providerLogoutUrl ?? "/login",
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
