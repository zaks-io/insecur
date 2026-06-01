import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "./constants.js";

export interface ParsedRequestCredentials {
  readonly bearerCredential: string | undefined;
  readonly workosSealedSession: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly csrfCookie: string | undefined;
}

function parseCookieHeader(cookieHeader: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (cookieHeader === undefined || cookieHeader === null || cookieHeader === "") {
    return cookies;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    cookies.set(name, value);
  }
  return cookies;
}

function parseBearerAuthorization(authorization: string | null | undefined): string | undefined {
  if (authorization === undefined || authorization === null || authorization === "") {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)$/iu.exec(authorization);
  return match?.[1];
}

export interface ParseRequestCredentialsInput {
  readonly authorizationHeader: string | null | undefined;
  readonly cookieHeader: string | null | undefined;
  readonly csrfHeader: string | null | undefined;
}

export function parseRequestCredentials(
  input: ParseRequestCredentialsInput,
): ParsedRequestCredentials {
  const cookies = parseCookieHeader(input.cookieHeader);
  return {
    bearerCredential: parseBearerAuthorization(input.authorizationHeader),
    workosSealedSession: cookies.get(WORKOS_SESSION_COOKIE),
    csrfHeader: input.csrfHeader ?? undefined,
    csrfCookie: cookies.get(INSECUR_CSRF_COOKIE),
  };
}
