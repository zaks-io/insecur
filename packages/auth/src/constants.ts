/** WorkOS AuthKit sealed session cookie (browser). */
export const WORKOS_SESSION_COOKIE = "wos-session";

/** Double-submit CSRF cookie for browser session mutations. */
export const INSECUR_CSRF_COOKIE = "insecur_csrf";

/** Header carrying the CSRF token for browser-originating mutations. */
export const INSECUR_CSRF_HEADER = "x-insecur-csrf";

/** Response header for memory-only CLI session credentials (never logged). */
export const INSECUR_SESSION_CREDENTIAL_HEADER = "x-insecur-session-credential";

/** Default CLI ephemeral session lifetime (15 minutes). */
export const CLI_SESSION_TTL_SECONDS = 900;
