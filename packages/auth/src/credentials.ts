import { readSingleCookieValue } from "./cookie-header.js";
import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "./constants.js";

export interface ParsedRequestCredentials {
  readonly bearerCredential: string | undefined;
  readonly workosSealedSession: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly csrfCookie: string | undefined;
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
  return {
    bearerCredential: parseBearerAuthorization(input.authorizationHeader),
    workosSealedSession: readSingleCookieValue(input.cookieHeader, WORKOS_SESSION_COOKIE),
    csrfHeader: input.csrfHeader ?? undefined,
    csrfCookie: readSingleCookieValue(input.cookieHeader, INSECUR_CSRF_COOKIE),
  };
}
