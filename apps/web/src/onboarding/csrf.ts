import { readSingleCookieValue } from "@insecur/auth/cookie-header";

const CSRF_COOKIE_NAME = "__Host-insecur_csrf";

/**
 * Read the `__Host-insecur_csrf` double-submit cookie out of a Cookie header (or
 * `document.cookie` string). The cookie is deliberately not HttpOnly so the browser half of the
 * wizard can echo it back on mutations. Duplicate names fail closed so header order cannot
 * select attacker-tossed state (INS-583). The name literal must match `INSECUR_CSRF_COOKIE` in
 * `@insecur/auth` (guarded by test); it is duplicated, and only the dependency-free
 * `@insecur/auth/cookie-header` subpath is imported, to keep the rest of the auth package out
 * of the browser bundle.
 */
export function csrfTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | undefined {
  return readSingleCookieValue(cookieHeader, CSRF_COOKIE_NAME);
}
