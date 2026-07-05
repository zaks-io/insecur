import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "./constants.js";

export interface SessionCookieAttributes {
  readonly name: string;
  readonly httpOnly: boolean;
  readonly sameSite: "Lax" | "Strict" | "None";
  readonly secure: boolean;
  readonly path: string;
}

/** Browser WorkOS sealed session cookie (set by BFF or exchange rotation). */
export const workosSessionCookieAttributes: SessionCookieAttributes = {
  name: WORKOS_SESSION_COOKIE,
  httpOnly: true,
  sameSite: "Lax",
  secure: true,
  path: "/",
};

/** Double-submit CSRF cookie (readable by browser JS for header echo). */
export const insecurCsrfCookieAttributes: SessionCookieAttributes = {
  name: INSECUR_CSRF_COOKIE,
  httpOnly: false,
  sameSite: "Lax",
  secure: true,
  path: "/",
};

function formatSameSite(value: SessionCookieAttributes["sameSite"]): string {
  return `SameSite=${value}`;
}

/**
 * Formats a Set-Cookie header value without embedding secrets in logs.
 * Callers must not log the returned string when it carries session material.
 */
export function formatSessionSetCookie(attributes: SessionCookieAttributes, value: string): string {
  const parts = [
    `${attributes.name}=${value}`,
    `Path=${attributes.path}`,
    formatSameSite(attributes.sameSite),
  ];
  if (attributes.httpOnly) {
    parts.push("HttpOnly");
  }
  if (attributes.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Clears a session cookie without logging prior values. */
export function formatSessionClearCookie(attributes: SessionCookieAttributes): string {
  const parts = [
    `${attributes.name}=`,
    `Path=${attributes.path}`,
    formatSameSite(attributes.sameSite),
    "Max-Age=0",
  ];
  if (attributes.httpOnly) {
    parts.push("HttpOnly");
  }
  if (attributes.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
