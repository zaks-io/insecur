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

/**
 * Token audience for the public API Worker deploy. The CLI/agent/CI bearer and the
 * BFF-minted scoped token both target this audience.
 */
export const INSECUR_API_TOKEN_AUDIENCE = "insecur-api";

/**
 * Token audience for the private Runtime Worker deploy (sole keyring holder, ADR-0077).
 * The API Worker mints a scoped hop token with this audience to reach RuntimeService over
 * the private Service Binding; the Runtime rejects any token not bound to this audience.
 */
export const INSECUR_RUNTIME_TOKEN_AUDIENCE = "insecur-runtime";

/**
 * Default lifetime of the API to Runtime scoped hop token (30 seconds). The hop happens
 * inside a single request over a private Service Binding, so the replay window is tiny.
 */
export const SCOPED_ACCESS_TOKEN_TTL_SECONDS = 30;
