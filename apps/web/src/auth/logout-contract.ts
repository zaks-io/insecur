/**
 * Shared contract between the logout server route and the browser sign-out form. Dependency-free
 * on purpose: the form component ships in the browser bundle and must not pull @insecur/auth in.
 */
export const LOGOUT_PATH = "/logout";

/**
 * Form field carrying the double-submit CSRF token. A plain HTML form cannot set the
 * `x-insecur-csrf` header, so the visible sign-out controls echo the non-HttpOnly CSRF cookie
 * through this hidden field instead (INS-582).
 */
export const LOGOUT_CSRF_FIELD = "csrf_token";
