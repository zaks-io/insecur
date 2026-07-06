import { base64UrlToBytes, bytesToBase64Url } from "@insecur/domain";

export const INSECUR_OAUTH_PKCE_COOKIE = "insecur_oauth_pkce";
const OAUTH_PKCE_TTL_SECONDS = 600;

export interface PkceRoundTrip {
  readonly state: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

export async function createPkcePair(): Promise<{
  readonly verifier: string;
  readonly challenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = bytesToBase64Url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function encodePkceRoundTrip(roundTrip: PkceRoundTrip): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(roundTrip)));
}

const RELATIVE_APP_PATH_BASE = "https://insecur.invalid";

/**
 * True when the value contains any C0 control character (U+0000–U+001F) or DEL (U+007F). CR/LF are
 * the response-splitting vector, and any of them make the runtime `Headers` constructor throw a 500
 * when the value lands in a `Location` header; some (e.g. a bare CR mid-path) also survive URL
 * resolution same-origin, so the origin check alone is not a sufficient backstop. Checked by
 * codepoint rather than a control-char regex literal (`no-control-regex`).
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Accepts only same-origin app paths for post-login redirects. Backslashes are rejected outright
 * because the WHATWG URL parser treats `\` as `/` for special schemes, so `Location: /\evil.com`
 * resolves to `https://evil.com` (open redirect). Control characters are rejected outright so this
 * validator is the response-splitting backstop rather than the runtime `Headers` constructor (which
 * fails closed with a 500). The parse-and-resolve check backstops the string checks against any
 * other parser quirk that could escape the app origin.
 */
function isRelativeAppPath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return false;
  }
  let resolved: URL;
  try {
    resolved = new URL(value, RELATIVE_APP_PATH_BASE);
  } catch {
    return false;
  }
  return resolved.origin === RELATIVE_APP_PATH_BASE;
}

function parsePkceRoundTripPayload(parsed: Partial<PkceRoundTrip>): PkceRoundTrip | null {
  if (
    typeof parsed.state !== "string" ||
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.returnTo !== "string" ||
    !isRelativeAppPath(parsed.returnTo)
  ) {
    return null;
  }
  return {
    state: parsed.state,
    codeVerifier: parsed.codeVerifier,
    returnTo: parsed.returnTo,
  };
}

export function decodePkceRoundTrip(value: string | undefined): PkceRoundTrip | null {
  if (!value) {
    return null;
  }
  const bytes = base64UrlToBytes(value);
  if (bytes === null) {
    return null;
  }
  try {
    return parsePkceRoundTripPayload(
      JSON.parse(new TextDecoder().decode(bytes)) as Partial<PkceRoundTrip>,
    );
  } catch {
    return null;
  }
}

export function formatPkceStateCookie(value: string): string {
  return [
    `${INSECUR_OAUTH_PKCE_COOKIE}=${value}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
    `Max-Age=${String(OAUTH_PKCE_TTL_SECONDS)}`,
  ].join("; ");
}

export function formatPkceStateClearCookie(): string {
  return [
    `${INSECUR_OAUTH_PKCE_COOKIE}=`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
    "Secure",
    "Max-Age=0",
  ].join("; ");
}

export function normalizeReturnTo(value: string | null, defaultReturnTo: string): string {
  if (value === null || value === "" || !isRelativeAppPath(value)) {
    return defaultReturnTo;
  }
  return value;
}
