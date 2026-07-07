import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  generateCsrfToken,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "@insecur/auth";
import {
  decodePkceRoundTrip,
  INSECUR_OAUTH_PKCE_COOKIE,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";

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
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const roundTrip = decodePkceRoundTrip(cookies.get(INSECUR_OAUTH_PKCE_COOKIE));
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
