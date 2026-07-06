// `form-action` is built dynamically in buildContentSecurityPolicy so the per-environment WorkOS
// AuthKit authorization origin can be appended after 'self'. Chromium enforces `form-action`
// against every URL in the form-submission redirect chain, so the login POST's 303 to the
// off-origin AuthKit host is blocked unless that exact origin is allowlisted here (INS-417).
const CSP_BASE_DIRECTIVES =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data:; font-src 'self'";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export interface ContentSecurityPolicyOptions {
  readonly sentryDsn?: string | undefined;
  /**
   * The WorkOS authorization origin(s) the login form's POST redirect chain traverses. On Turnstile
   * success the POST 303-redirects toward the WorkOS-hosted AuthKit sign-in; Chromium enforces
   * `form-action` against every URL in that chain, so each off-origin hop must be allowlisted. The
   * WorkOS Node SDK's authorization URL is `https://api.workos.com/user_management/authorize?...`,
   * which itself redirects to the per-environment hosted `*.authkit.app` domain, so both hosts can
   * appear in the chain. Threaded from `WORKOS_AUTHKIT_ORIGIN` as a space/comma-separated list of
   * https origins (e.g. `https://api.workos.com https://<tenant>.authkit.app`); non-https or
   * malformed entries are dropped. When it resolves to no valid origin, `form-action` fails closed
   * to `'self'` only (never a wildcard).
   */
  readonly workosAuthkitOrigin?: string | undefined;
}

export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: ContentSecurityPolicyOptions = {},
): string {
  const connectSrc = ["'self'"];
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, TURNSTILE_ORIGIN];
  const frameSrc = ["'self'", TURNSTILE_ORIGIN];
  const formAction = ["'self'"];
  const sentryOrigin = httpsOrigin(options.sentryDsn);
  if (sentryOrigin) {
    connectSrc.push(sentryOrigin);
  }
  for (const origin of httpsOrigins(options.workosAuthkitOrigin)) {
    formAction.push(origin);
  }

  return `${CSP_BASE_DIRECTIVES}; form-action ${formAction.join(" ")}; connect-src ${connectSrc.join(" ")}; frame-src ${frameSrc.join(" ")}; script-src ${scriptSrc.join(" ")}; style-src 'self' 'nonce-${nonce}'`;
}

/** Parse a single configured URL to its https origin, or undefined if unset, non-https, or malformed. */
function httpsOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse a space/comma-separated list of configured URLs to deduplicated https origins, dropping any
 * unset, non-https, or malformed entry. Returns an empty array when nothing valid is configured so
 * `form-action` fails closed to `'self'`.
 */
function httpsOrigins(value: string | undefined): readonly string[] {
  if (!value) {
    return [];
  }
  const origins = new Set<string>();
  for (const token of value.split(/[\s,]+/)) {
    const origin = httpsOrigin(token);
    if (origin) {
      origins.add(origin);
    }
  }
  return [...origins];
}
