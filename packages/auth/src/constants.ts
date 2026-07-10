/**
 * WorkOS AuthKit sealed session cookie (browser). The `__Host-` prefix makes the cookie
 * host-only: browsers reject it unless it is Secure, Path=/, and carries no Domain attribute,
 * so a compromised sibling subdomain cannot toss an overriding parent-domain variant (INS-583).
 */
export const WORKOS_SESSION_COOKIE = "__Host-wos-session";

/** Double-submit CSRF cookie for browser session mutations (`__Host-` host-only, INS-583). */
export const INSECUR_CSRF_COOKIE = "__Host-insecur_csrf";

/** Header carrying the CSRF token for browser-originating mutations. */
export const INSECUR_CSRF_HEADER = "x-insecur-csrf";

/** Response header for short-lived CLI session credentials (never logged). */
export const INSECUR_SESSION_CREDENTIAL_HEADER = "x-insecur-session-credential";

/** Default CLI session lifetime (24 hours); high-risk actions are gated per-action by High-Assurance Challenges (ADR-0032), not by session length. */
export const CLI_SESSION_TTL_SECONDS = 86_400;

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
