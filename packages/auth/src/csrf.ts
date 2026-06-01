import { INSECUR_CSRF_COOKIE, INSECUR_CSRF_HEADER } from "./constants.js";

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

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
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
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
  try {
    const cookieBytes = decodeBase64Url(cookieValue);
    const headerBytes = decodeBase64Url(headerValue);
    return timingSafeEqualBytes(cookieBytes, headerBytes);
  } catch {
    return cookieValue === headerValue;
  }
}

export const csrfCookieAttributes = {
  name: INSECUR_CSRF_COOKIE,
  httpOnly: false,
  sameSite: "Lax" as const,
  secure: true,
  path: "/",
};

export const csrfHeaderName = INSECUR_CSRF_HEADER;
