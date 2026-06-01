import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";
import { INSECUR_CSRF_COOKIE, INSECUR_CSRF_HEADER } from "./constants.js";

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function validateCsrfToken(
  cookieValue: string | undefined,
  headerValue: string | undefined,
): boolean {
  if (cookieValue === undefined || headerValue === undefined) {
    return false;
  }
  if (cookieValue === "" || headerValue === "") {
    return false;
  }
  const cookieBytes = base64UrlToBytes(cookieValue);
  const headerBytes = base64UrlToBytes(headerValue);
  if (cookieBytes === null || headerBytes === null) {
    return false;
  }
  return timingSafeEqualBytes(cookieBytes, headerBytes);
}

export const csrfCookieAttributes = {
  name: INSECUR_CSRF_COOKIE,
  httpOnly: false,
  sameSite: "Lax" as const,
  secure: true,
  path: "/",
};

export const csrfHeaderName = INSECUR_CSRF_HEADER;
