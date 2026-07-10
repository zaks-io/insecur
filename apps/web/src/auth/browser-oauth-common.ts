import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  generateCsrfToken,
  insecurCsrfCookieAttributes,
  readSingleCookieValue,
  workosSessionCookieAttributes,
} from "@insecur/auth";
import {
  decodePkceRoundTrip,
  INSECUR_OAUTH_PKCE_COOKIE,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";

export function oauthCallbackUrl(request: Request, pathname: string): string {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function establishBrowserSessionCookies(sealedSession: string): readonly string[] {
  const csrfToken = generateCsrfToken();
  return [
    formatSessionSetCookie(workosSessionCookieAttributes, sealedSession),
    formatSessionSetCookie(insecurCsrfCookieAttributes, csrfToken),
  ];
}

export function clearBrowserSessionCookies(): readonly string[] {
  return [
    formatSessionClearCookie(workosSessionCookieAttributes),
    formatSessionClearCookie(insecurCsrfCookieAttributes),
  ];
}

export function readPkceOAuthCallback(
  request: Request,
  acceptRoundTrip: (roundTrip: PkceRoundTrip) => boolean = () => true,
): {
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
  // Duplicate PKCE cookies fail closed: header order must not pick attacker state (INS-583).
  const roundTrip = decodePkceRoundTrip(
    readSingleCookieValue(request.headers.get("Cookie"), INSECUR_OAUTH_PKCE_COOKIE),
  );
  if (roundTrip?.state !== state || !acceptRoundTrip(roundTrip)) {
    return null;
  }
  return { code, state, roundTrip };
}

export function oauthRequestMetadata(request: Request): {
  readonly ipAddress?: string;
  readonly userAgent?: string;
} {
  const ipAddress = request.headers.get("CF-Connecting-IP");
  const userAgent = request.headers.get("User-Agent");
  return {
    ...(ipAddress === null ? {} : { ipAddress }),
    ...(userAgent === null ? {} : { userAgent }),
  };
}
