const CSRF_COOKIE_NAME = "insecur_csrf";

/**
 * Read the `insecur_csrf` double-submit cookie out of a Cookie header (or `document.cookie`
 * string). The cookie is deliberately not HttpOnly so the browser half of the wizard can echo
 * it back on mutations. Dependency-free on purpose: this module ships in the browser bundle.
 */
export function csrfTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | undefined {
  if (cookieHeader === undefined || cookieHeader === null || cookieHeader === "") {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${CSRF_COOKIE_NAME}=`)) {
      const value = trimmed.slice(CSRF_COOKIE_NAME.length + 1);
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}
